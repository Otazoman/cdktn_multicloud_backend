import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "config/.env") });

import { App } from "cdktn";
import { MultiCloudBackendStack } from "./stacks/MultiCloudBackendStack";

const app = new App();
new MultiCloudBackendStack(app, "app");
app.synth();
