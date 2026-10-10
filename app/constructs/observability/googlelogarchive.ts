import { LoggingProjectSink } from "@cdktn/provider-google/lib/logging-project-sink";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { StorageBucket } from "@cdktn/provider-google/lib/storage-bucket";
import { StorageBucketIamMember } from "@cdktn/provider-google/lib/storage-bucket-iam-member";
import { Construct } from "constructs";
import { addTerraformDependency } from "../../utils/terraformDependency";

export interface GoogleLogArchiveParams {
  project: string;
  bucketName: string;
  location: string;
  /** Delete the bucket together with its contents on destroy */
  forceDestroy: boolean;
  lifecycle?: { toArchiveClassDays?: number; deleteDays?: number };
  sinkName: string;
  /** Logging query that selects the logs to archive */
  filter: string;
  labels?: { [key: string]: string };
}

/**
 * Archives logs to a Cloud Storage bucket through a log sink. Cloud Logging
 * writes the matching entries to the bucket in hourly batches.
 */
export function createGoogleLogArchive(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleLogArchiveParams,
) {
  const { toArchiveClassDays, deleteDays } = params.lifecycle ?? {};
  const bucket = new StorageBucket(scope, "google-log-archive-bucket", {
    provider,
    project: params.project,
    name: params.bucketName,
    location: params.location,
    forceDestroy: params.forceDestroy,
    uniformBucketLevelAccess: true,
    publicAccessPrevention: "enforced",
    lifecycleRule: [
      ...(toArchiveClassDays
        ? [
            {
              condition: { age: toArchiveClassDays },
              action: { type: "SetStorageClass", storageClass: "ARCHIVE" },
            },
          ]
        : []),
      ...(deleteDays
        ? [{ condition: { age: deleteDays }, action: { type: "Delete" } }]
        : []),
    ],
    labels: params.labels,
  });

  const sink = new LoggingProjectSink(scope, "google-log-archive-sink", {
    provider,
    project: params.project,
    name: params.sinkName,
    destination: `storage.googleapis.com/${bucket.name}`,
    filter: params.filter,
    uniqueWriterIdentity: true,
  });

  // The sink writes with its own service account
  const writer = new StorageBucketIamMember(scope, "google-log-archive-sink-writer", {
    provider,
    bucket: bucket.name,
    role: "roles/storage.objectCreator",
    member: sink.writerIdentity,
  });
  addTerraformDependency(writer, sink);

  return { bucket, sink };
}
