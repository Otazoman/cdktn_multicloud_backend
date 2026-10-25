/**
 * Only the load balancers reach the API containers: AWS ECS from the ALB's
 * security group, Azure Container Apps from the Application Gateway subnet
 * (Cloud Run: ingress limited to the load balancer, constructs/container/
 * googlecloudrun.ts).
 */
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

let synth: any;
beforeAll(() => {
  synth = synthCase({ name: "backend-access", overrides: FEATURE_SETS.allOn });
}, 120000);

test("AWS: the ECS security group accepts the API port from the ALB only", () => {
  const ecsSg = resourcesOf(synth, "aws_security_group").find((sg) => sg.name === "ecs-sg");
  expect(ecsSg.ingress).toHaveLength(1);
  expect(ecsSg.ingress[0]).toMatchObject({ from_port: 8080, to_port: 8080, cidr_blocks: [] });
  expect(ecsSg.ingress[0].security_groups).toEqual(["${aws_security_group.awsSecurityGroup-alb-sg.id}"]);
});

test("AWS: the ECS tasks get no public IP", () => {
  resourcesOf(synth, "aws_ecs_service").forEach((service) =>
    expect(service.network_configuration.assign_public_ip).toBe(false),
  );
});

test("Azure: the API Container App accepts the Application Gateway subnet only", () => {
  const app = resourcesOf(synth, "azurerm_container_app").find((a) => a.name === "backend-api-service");
  expect(app.ingress.ip_security_restriction).toEqual([
    expect.objectContaining({ action: "Allow", ip_address_range: "10.2.11.0/24" }),
  ]);
});

test("Google Cloud: the API service accepts the load balancer only", () => {
  const service = resourcesOf(synth, "google_cloud_run_v2_service").find((s) => s.name === "web-service-with-lb");
  expect(service.ingress).toBe("INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER");
});

test("the health check URL of each load balancer is printed after the deploy", () => {
  const urls = synth.output["api-health-urls"].value;
  expect(Object.keys(urls).sort()).toEqual([
    "aws:plain-http-alb",
    "azure:plain-http-appgw",
    "google:run-regional-http-lb",
  ]);
  Object.values<string>(urls).forEach((url) => expect(url).toMatch(/^http:\/\/.+\/healthz$/));
});
