import { describe, expect, it } from "vitest";
import { appCredCloudsYaml, appCredFilename, appCredOpenrc } from "./files";

const input = {
  id: "ac-1",
  name: "deploy bot",
  secret: "s3'cret",
  authUrl: "https://identity.test/v3",
  region: "Melbourne",
};

describe("application credential files", () => {
  it("writes an openrc that quotes the secret for the shell", () => {
    const text = appCredOpenrc(input);
    expect(text).toContain("export OS_AUTH_TYPE=v3applicationcredential");
    expect(text).toContain("export OS_APPLICATION_CREDENTIAL_ID='ac-1'");
    expect(text).toContain(
      "export OS_APPLICATION_CREDENTIAL_SECRET='s3'\\''cret'",
    );
    expect(text).toContain("export OS_REGION_NAME='Melbourne'");
  });

  it("writes a clouds.yaml with the application credential auth type", () => {
    const text = appCredCloudsYaml(input);
    expect(text).toContain('auth_url: "https://identity.test/v3"');
    expect(text).toContain('application_credential_secret: "s3\'cret"');
    expect(text).toContain('auth_type: "v3applicationcredential"');
  });

  it("builds safe file names", () => {
    expect(appCredFilename("deploy bot", "-openrc.sh")).toBe(
      "app-cred-deploy_bot-openrc.sh",
    );
    expect(appCredFilename("", "-openrc.sh")).toBe(
      "app-cred-app-cred-openrc.sh",
    );
  });
});
