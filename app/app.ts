// Credentials and secrets come from the container environment: compose.yaml
// loads .env.<DEPLOY_ENV> (FEAT-04). config/.env is no longer read.
import { App } from "cdktn";
import { MultiCloudBackendStack } from "./stacks/MultiCloudBackendStack";

const app = new App();
new MultiCloudBackendStack(app, "app");
app.synth();
