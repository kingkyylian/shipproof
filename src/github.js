export const COMMENT_MARKER = "<!-- shipproof-report -->";

export function getPullRequestContext(event, env = process.env) {
  const repository = env.GITHUB_REPOSITORY;
  const pullRequest = event?.pull_request;

  if (!repository || !pullRequest?.number) {
    return null;
  }

  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo,
    pullNumber: pullRequest.number,
    headSha: pullRequest.head?.sha
  };
}

export async function listPullRequestFiles({ context, request }) {
  const files = [];

  for (let page = 1; ; page += 1) {
    const response = await request(
      `/repos/${context.owner}/${context.repo}/pulls/${context.pullNumber}/files?per_page=100&page=${page}`
    );

    if (!Array.isArray(response) || response.length === 0) {
      break;
    }

    for (const file of response) {
      if (typeof file.filename === "string") {
        files.push(file.filename);
      }
    }
  }

  return files;
}

export async function upsertShipProofComment({ context, markdown, request }) {
  const commentsPath = `/repos/${context.owner}/${context.repo}/issues/${context.pullNumber}/comments?per_page=100`;
  const comments = await request(commentsPath);
  const body = buildCommentBody(markdown);
  const existing = Array.isArray(comments)
    ? comments.find((comment) => typeof comment.body === "string" && comment.body.includes(COMMENT_MARKER))
    : null;

  if (existing) {
    const response = await request(`/repos/${context.owner}/${context.repo}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: { body }
    });

    return { action: "updated", response };
  }

  const response = await request(`/repos/${context.owner}/${context.repo}/issues/${context.pullNumber}/comments`, {
    method: "POST",
    body: { body }
  });

  return { action: "created", response };
}

export function buildCommentBody(markdown) {
  return `${COMMENT_MARKER}\n${markdown}`;
}

export function createGitHubRequest({ token, baseUrl = "https://api.github.com", fetchImpl = globalThis.fetch }) {
  if (!token) {
    throw new Error("GitHub token is required");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime");
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  return async function request(path, options = {}) {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`GitHub API ${response.status} for ${path}: ${detail}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  };
}
