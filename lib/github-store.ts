// Store verified users in the GitHub repo itself (data/verified-users.json)
// Vercel writes via GitHub API, bot reads from local clone + git pull

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const REPO = "clawdbotatg/token-gated-chat";
const FILE_PATH = "data/verified-users.json";

export interface VerifiedUser {
  wallet: string;
  verifiedAt: number;
}

export type VerifiedUsers = Record<string, VerifiedUser>;

async function getFileFromGitHub(): Promise<{ content: VerifiedUsers; sha: string }> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (res.status === 404) {
    return { content: {}, sha: "" };
  }

  const data = await res.json();
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  return { content: JSON.parse(decoded), sha: data.sha };
}

async function writeFileToGitHub(content: VerifiedUsers, sha: string): Promise<void> {
  const body: any = {
    message: `update verified users [bot]`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
  };
  if (sha) body.sha = sha;

  await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function getVerifiedUsers(): Promise<VerifiedUsers> {
  const { content } = await getFileFromGitHub();
  return content;
}

export async function saveVerifiedUser(telegramUserId: string, wallet: string): Promise<void> {
  const { content, sha } = await getFileFromGitHub();
  content[telegramUserId] = { wallet: wallet.toLowerCase(), verifiedAt: Date.now() };
  await writeFileToGitHub(content, sha);
}

export async function removeVerifiedUser(telegramUserId: string): Promise<void> {
  const { content, sha } = await getFileFromGitHub();
  delete content[telegramUserId];
  await writeFileToGitHub(content, sha);
}
