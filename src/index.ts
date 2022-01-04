import "@logseq/libs";
import { BlockEntity } from "@logseq/libs/dist/LSPlugin";

import parse from "parse-duration";
import { DateTimeFormatter, Duration, LocalDate } from "@js-joda/core";

import { parseGithubUrl, GithubClient } from "./github";

const githubUrlSlashCommand = async () => {
  await logseq.Editor.insertAtEditingCursor(`{{renderer :githubUrl}}`);
};

const githubLastweekPullRequestSlashCommand = async () => {
  const now = new Date();
  const day = now.getDay();
  let mondayDate = now.getDate() - day;
  if (day === 0) {
    mondayDate -= 6;
  } else {
    mondayDate += 1;
  }

  const monday = new Date(now.setDate(mondayDate));
  monday.setHours(0);
  monday.setMinutes(0);
  monday.setSeconds(0);

  const currentBlock = await logseq.Editor.getCurrentBlock();
  const [username, repo] = currentBlock.content
    .split(",")
    .map((item) => item.trim());

  const newBlocks = await renderGithubRecentPullRequestToBlocks(
    username,
    repo,
    new Date(monday)
  );
  newBlocks.forEach((b) => {
    logseq.Editor.insertBlock(currentBlock.uuid, b.content, {
      sibling: false,
    });
  });
};

const renderGithubUrl = (
  url: string,
  renderRepoName: boolean = true,
  html: boolean = true
) => {
  const parsed = parseGithubUrl(url);
  if (parsed == null) {
    return `<a target="_blank" href="${url}" class="external-link">INVALID URL</a>`;
  }

  let content = renderRepoName
    ? `${parsed.repo.owner}/${parsed.repo.repo}`
    : "";

  switch (parsed.type) {
    case "repo":
      break;
    case "discuss":
    case "pr":
    case "issue":
      content += `#${parsed.number}`;
      if (!html) {
        content = "\\" + content;
      }
      if (parsed.comment != null) {
        content += "(comment)";
      }
      break;
    case "commit":
      content += `@${parsed.hash}`;
      break;
  }

  if (html) {
    return `<a target="_blank" href="${url}" class="external-link">${content}</a>`;
  } else {
    return `\[${content}](${url})`;
  }
};

const renderGithubRecentPullRequestToBlocks = async (
  username: string,
  repo: string,
  mergedPrAfter: Date
) => {
  const token = logseq.settings.github_access_token;
  if (token == null) {
    throw new Error("Github access token is not set");
  }

  const client = new GithubClient(token);
  const openedPr = await client.listAllOpenedPRInRepo(username, repo);
  const mergedPr = await client.list_recent_merged_pr_in_repo(
    username,
    repo,
    mergedPrAfter
  );

  const blocks = [];
  openedPr.forEach((activity: any) => {
    let tag = "";
    if (activity.isDraft) {
      tag = "[WIP]";
    } else if (activity.state === "OPEN") {
      tag = "[REVIEW]";
    }
    blocks.push({
      content: `${tag} ${activity.title.replaceAll(
        "#",
        "\\#"
      )}${renderGithubUrl(activity.url, false, false)}`,
    });
  });
  mergedPr.forEach((activity: any) => {
    const tag = "[DONE]";
    blocks.push({
      content: `${tag} ${activity.title.replaceAll(
        "#",
        "\\#"
      )}${renderGithubUrl(activity.url, false, false)}`,
    });
  });

  return blocks;
};

const renderGithubIssuesToBlocks = async (repo: string, query: string) => {
  const token = logseq.settings.github_access_token;
  if (token == null) {
    throw new Error("Github access token is not set");
  }

  const client = new GithubClient(token);
  const issues = await client.listAllIssues(repo, query);

  return issues.map((issue: any) => {
    return {
      content: `TODO [\#${issue.number}](${issue.url}) ${issue.title.replaceAll(
        "#",
        "\\#"
      )}`,
      properties: {
        // properties will be converted to camelCase by logseq
        issue_number: issue.number,
      },
    };
  });
};

async function main() {
  logseq.Editor.registerSlashCommand("Github Url", githubUrlSlashCommand);
  logseq.Editor.registerSlashCommand(
    "Github Last Week Pull Request",
    githubLastweekPullRequestSlashCommand
  );

  logseq.App.onMacroRendererSlotted(({ slot, payload }) => {
    const [type, url] = payload.arguments;
    if (!type?.startsWith(":githubUrl")) return;

    logseq.provideUI({
      slot,
      reset: true,
      template: renderGithubUrl(url),
    });
  });

  const syncPeriod = parse(logseq.settings.sync_period || "5m", "ms");

  const syncIssues = async () => {
    const targetBlocks = (
      await logseq.DB.datascriptQuery(`
        [
            :find (pull ?b [*])
            :where
            [?b :block/properties ?p]
            [(get ?p :repo) ?r]
            [(get ?p :query) ?q]
            [(not= ?r "nil")]
            [(not= ?q "nil")]
        ]
        `)
    ).map((blockArray) => blockArray[0]);

    targetBlocks.forEach(async (block: any) => {
      // TODO: get uuid in a better way
      const blockUuid = block.uuid.$uuid$;
      const repo = block.properties.repo;
      let query = block.properties.query;
      const recentDay = block.properties["recent-day"] || 0;

      console.log("logseq-github: sync issues", `uuid: ${blockUuid}`);

      if (recentDay > 0) {
        const past = LocalDate.now().atStartOfDay().minusDays(recentDay);
        query += ` updated:>=${past.format(DateTimeFormatter.ISO_LOCAL_DATE)}`;
      }

      // `includeChildren` will not only get children, but also clear the children cache
      const targetBlock = await logseq.Editor.getBlock(blockUuid, {
        includeChildren: true,
      });
      const renderedBlocks = await renderGithubIssuesToBlocks(repo, query);

      const existChildren = (targetBlock.children as BlockEntity[]) || [];
      // remove disappeared issues
      await Promise.all(
        existChildren.map(async (childBlock) => {
          if (
            renderedBlocks.find(
              (b) =>
                b.properties?.issue_number ===
                childBlock.properties?.issueNumber
            ) === undefined
          ) {
            // TODO: support other merge strategy
            console.log(
              "logseq-github: remove issue",
              childBlock.properties?.issueNumber,
              renderedBlocks
            );
            await logseq.Editor.removeBlock(childBlock.uuid);
          }
        })
      );

      // add new issues
      await Promise.all(
        renderedBlocks.map(async (renderedBlock) => {
          if (
            existChildren.find((child) => {
              return (
                child.properties?.issueNumber ===
                renderedBlock.properties?.issue_number
              );
            }) === undefined
          ) {
            // This is a new block
            console.log(
              "logseq-github: insert issue",
              renderedBlock.properties?.issue_number
            );
            await logseq.Editor.insertBlock(
              targetBlock.uuid,
              renderedBlock.content,
              {
                sibling: false,
                properties: renderedBlock.properties,
              }
            );
          }
        })
      );

      console.log("logseq-github: sync finished", `uuid: ${blockUuid}`);
    });
  };
  console.log("logseq-github: setup interval controller for issues");
  setInterval(syncIssues, syncPeriod);
  await syncIssues();
}

logseq.ready(main).catch((e) => {
  logseq.App.showMsg(e.message, "error");
  console.error(e);
});
