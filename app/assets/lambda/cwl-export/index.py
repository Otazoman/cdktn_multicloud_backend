"""Exports one UTC day of CloudWatch Logs to S3 (FEAT-03 log archive, mode "export").

Invoked by an EventBridge Scheduler schedule. Exports the last full UTC day
that ended at least DELAY_HOURS ago (log data can take up to 12 hours to
become exportable), one log group at a time because an account can run only
one export task at a time.

Environment variables:
  BUCKET       destination S3 bucket
  LOG_GROUPS   JSON list of {"name": "<log group>", "prefix": "<S3 prefix>"}
  DELAY_HOURS  hours to wait before a day is exported (default 12)
"""

import json
import os
import time
from datetime import datetime, timedelta, timezone

import boto3

logs = boto3.client("logs")


def wait_for_task(task_id):
    while True:
        task = logs.describe_export_tasks(taskId=task_id)["exportTasks"][0]
        status = task["status"]["code"]
        if status == "COMPLETED":
            return
        if status in ("CANCELLED", "FAILED"):
            raise RuntimeError(f"Export task {task_id} {status}: {task['status'].get('message')}")
        time.sleep(10)


def create_task(**kwargs):
    while True:
        try:
            return logs.create_export_task(**kwargs)["taskId"]
        except logs.exceptions.LimitExceededException:
            # Another export task of the account is running
            time.sleep(30)


def handler(event, context):
    delay = timedelta(hours=int(os.environ.get("DELAY_HOURS", "12")))
    end = (datetime.now(timezone.utc) - delay).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start = end - timedelta(days=1)
    day = start.strftime("%Y/%m/%d")

    for group in json.loads(os.environ["LOG_GROUPS"]):
        task_id = create_task(
            taskName=f"{group['prefix']}-{start:%Y%m%d}"[:512],
            logGroupName=group["name"],
            fromTime=int(start.timestamp() * 1000),
            to=int(end.timestamp() * 1000),
            destination=os.environ["BUCKET"],
            destinationPrefix=f"{group['prefix']}/{day}",
        )
        wait_for_task(task_id)
        print(f"Exported {group['name']} {day} (task {task_id})")
