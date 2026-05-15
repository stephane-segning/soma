import fse from "fs-extra";
import nunjucks from "nunjucks";
import { promises as fs } from "node:fs";
import path from "node:path";
import { makeExecutable } from "./fs-utils.js";
import type { TemplateContextOptions } from "./types.js";

const nunjucksEnv = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: true,
});

export function buildTemplateContext(options: TemplateContextOptions) {
  return {
    name: options.name,
    version: options.version,
    desktop_version: options.desktopVersion,
    bundle_version: options.bundleVersion,
    os: options.os,
    arch: options.arch,
    install_prefix: options.installPrefix,
    service_label_daemon: options.serviceLabelDaemon,
    service_label_agent: options.serviceLabelAgent,
    homepage: options.homepage,
    docs_url: options.docsUrl,
    docker_images:
      options.dockerImages && options.dockerImages.trim().length > 0
        ? options.dockerImages
        : "None specified.",
    repo: options.repo,
    daemons_repo: options.daemonsRepo || options.repo,
    daemons_tag: options.daemonsTag || `daemons-v${options.version}`,
    desktop_repo: options.desktopRepo || options.repo,
    desktop_tag: options.desktopTag || `desktop-v${options.desktopVersion}`,
    daemons_manifest_source: options.daemonsManifestSource || "not used",
    desktop_manifest_source: options.desktopManifestSource || "not used",
  };
}

export async function renderTemplates(
  templateRoot: string,
  staging: string,
  ctx: Record<string, string>
) {
  const readmePath = path.join(staging, "README.md");
  await renderTemplate(
    path.join(templateRoot, "readme", "README.md.j2"),
    readmePath,
    ctx
  );

  const installPath = path.join(staging, "install.sh");
  await renderTemplate(
    path.join(templateRoot, "install", "install.sh.j2"),
    installPath,
    ctx
  );
  await makeExecutable(installPath);

  const uninstallPath = path.join(staging, "uninstall.sh");
  await renderTemplate(
    path.join(templateRoot, "install", "uninstall.sh.j2"),
    uninstallPath,
    ctx
  );
  await makeExecutable(uninstallPath);

  const systemdDaemon = path.join(staging, "soma-daemon.service");
  await renderTemplate(
    path.join(templateRoot, "systemd", "soma-daemon.service.j2"),
    systemdDaemon,
    ctx
  );
  const systemdAgent = path.join(staging, "soma-agentd.service");
  await renderTemplate(
    path.join(templateRoot, "systemd", "soma-agentd.service.j2"),
    systemdAgent,
    ctx
  );

  const plistDaemon = path.join(staging, "soma-daemon.plist");
  await renderTemplate(
    path.join(templateRoot, "launchd", "digital.camer.soma.daemon.plist.j2"),
    plistDaemon,
    ctx
  );
  const plistAgent = path.join(staging, "soma-agentd.plist");
  await renderTemplate(
    path.join(templateRoot, "launchd", "digital.camer.soma.agentd.plist.j2"),
    plistAgent,
    ctx
  );

  return {
    readme: readmePath,
    installScript: installPath,
    uninstallScript: uninstallPath,
    systemdDaemon,
    systemdAgent,
    plistDaemon,
    plistAgent,
  };
}

async function renderTemplate(
  templatePath: string,
  dest: string,
  ctx: Record<string, string>
) {
  const text = await fs.readFile(templatePath, "utf8");
  const rendered = nunjucksEnv.renderString(text, ctx);
  await fse.ensureDir(path.dirname(dest));
  await fs.writeFile(dest, rendered, "utf8");
}
