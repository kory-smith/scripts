import { parseArgs } from "util";
import { Glob } from "bun";
import AdmZip from "adm-zip";

function assertToken() {
  const TOKEN = process.env.GITHUB_TOKEN;

  if (!TOKEN) {
    console.error("GitHub token not found. Exiting...");
    process.exit(1);
  }
  return TOKEN;
}

function assertRunID() {
  const { positionals } = parseArgs({
    args: Bun.argv,
    strict: true,
    allowPositionals: true,
  });

  // By default, there are always two positionals: The path to bun and the path to the script.
  const DEFAULT_POSITIONALS = 2;

  if (positionals.length <= DEFAULT_POSITIONALS) {
    console.error("No run ID provided. Please provide the run ID.");
    process.exit(1);
  }
  if (positionals.length > DEFAULT_POSITIONALS + 1) {
    console.error(
      "Too many arguments provided. Please provide only the run ID."
    );
    process.exit(1);
  }

  const runID = positionals[2];

  return runID;
}

async function fetchArtifactInfo({
  token,
  runID,
}: {
  token: string;
  runID: string;
}): Promise<Array<{ archive_download_url: string; name: string }>> {
  const baseURL =
    "https://api.github.com/repos/krogertechnology/esperanto/actions/runs/";
  const queryParams = new URLSearchParams({ per_page: "100" });
  const artifactsListURL = `${baseURL}${runID}/artifacts?${queryParams}`;
  const response = await fetch(artifactsListURL, {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Something went wrong when fetching artifact info for run ${runID}`
    );
  }
  const artifacts = await response.json();
  const downloadURLs: Array<{ archive_download_url: string; name: string }> =
    artifacts.artifacts.map(
      (artifact: { archive_download_url: string; name: string }) => {
        return {
          archive_download_url: artifact.archive_download_url,
          name: artifact.name,
        };
      }
    );
  return downloadURLs;
}

async function fetchArtifact({
  token,
  downloadURL,
}: {
  token: string;
  downloadURL: string;
}) {
  const response = await fetch(downloadURL, {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Something went wrong when fetching artifact from ${downloadURL}`
    );
  }

  return await response.arrayBuffer();
}

async function writeArtifact({
  buffer,
  name,
  location,
}: {
  buffer: ArrayBuffer;
  name: string;
  location: string;
}) {
  await Bun.write(location + name + ".zip", buffer);
}

async function downloadArtifact({
  downloadURL,
  name,
  token,
  location = "./test/",
}: {
  downloadURL: string;
  name: string;
  token: string;
  location: string;
}) {
  const buffer = await fetchArtifact({ token, downloadURL });
  await writeArtifact({ buffer, name, location });
}

async function downloadAllArtifactsForRun({
  token,
  runID,
  location = "./test/",
}: {
  token: string;
  runID: string;
  location: string;
}) {
  const downloadURLs = await fetchArtifactInfo({ token, runID });

  const downloadPromises = downloadURLs.map(
    async ({ archive_download_url, name }) => {
      await downloadArtifact({
        token,
        downloadURL: archive_download_url,
        name,
        location,
      });
    }
  );

  await Promise.all(downloadPromises);
}

function partial_doZippyStuff() {
  const zipsGlob = new Glob("**/*.zip");

  for (const report of zipsGlob.scanSync("./test/resources")) {
    const fullPath = "./test/resources/" + report;
    const zip = new AdmZip(fullPath);

    zip.getEntries().forEach(function (entry) {
      // if (entry.entryName.startsWith("data/") && entry.entryName.endsWith(".zip")) {
      console.log({entry: entry.entryName})
    });
  }
}

function wasMocked(request: any) {
  return request.snapshot._wasFulfilled
}

async function main() {
  const TOKEN = assertToken();

  const runID = assertRunID();

  await downloadAllArtifactsForRun({token: TOKEN, runID, location: "./test/"});

  // partial_doZippyStuff();
}

await main();
