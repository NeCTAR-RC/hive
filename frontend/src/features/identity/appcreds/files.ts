// The openrc and clouds.yaml downloads offered once an application
// credential is created (Horizon identity/application_credentials
// openrc.sh.template and clouds.yaml.template). Built in the browser so the
// secret never goes back to the server.

export interface AppCredFileInput {
  id: string;
  name: string;
  secret: string;
  authUrl: string;
  region: string;
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function yamlQuote(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function appCredOpenrc(input: AppCredFileInput): string {
  return [
    "#!/usr/bin/env bash",
    "export OS_AUTH_TYPE=v3applicationcredential",
    `export OS_AUTH_URL=${shellQuote(input.authUrl)}`,
    "export OS_IDENTITY_API_VERSION=3",
    `export OS_REGION_NAME=${shellQuote(input.region)}`,
    "export OS_INTERFACE=public",
    `export OS_APPLICATION_CREDENTIAL_ID=${shellQuote(input.id)}`,
    `export OS_APPLICATION_CREDENTIAL_SECRET=${shellQuote(input.secret)}`,
    "",
  ].join("\n");
}

export function appCredCloudsYaml(input: AppCredFileInput): string {
  return [
    "# This is a clouds.yaml file, which can be used by OpenStack tools as a source",
    "# of configuration on how to connect to a cloud. If this is your only cloud,",
    "# just put this file in ~/.config/openstack/clouds.yaml and tools like",
    "# python-openstackclient will just work with no further config.",
    "clouds:",
    "  openstack:",
    "    auth:",
    `      auth_url: ${yamlQuote(input.authUrl)}`,
    `      application_credential_id: ${yamlQuote(input.id)}`,
    `      application_credential_secret: ${yamlQuote(input.secret)}`,
    `    region_name: ${yamlQuote(input.region)}`,
    '    interface: "public"',
    "    identity_api_version: 3",
    '    auth_type: "v3applicationcredential"',
    "",
  ].join("\n");
}

/** "app-cred-<name>-openrc.sh" with anything odd in the name replaced. */
export function appCredFilename(name: string, suffix: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_") || "app-cred";
  return `app-cred-${safe}${suffix}`;
}
