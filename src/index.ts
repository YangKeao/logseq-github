import '@logseq/libs'
import {BlockEntity} from '@logseq/libs/dist/LSPlugin'

import parse from 'parse-duration'
import { DateTimeFormatter, Duration, LocalDate } from '@js-joda/core'

import {parseGithubUrl, GithubClient} from './github'

const github_url_slash_command = async () => {
    await logseq.Editor.insertAtEditingCursor(
        `{{renderer :githubUrl}}`
    )
}

const github_lastweek_pull_request_slash_command = async () => {
    let now = new Date()
    let day = now.getDay()
    let mondayDate = now.getDate() - day
    if (day == 0) {
        mondayDate -= 6
    } else {
        mondayDate += 1
    }
    
    let monday = new Date(now.setDate(mondayDate));
    monday.setHours(0);
    monday.setMinutes(0);
    monday.setSeconds(0);

    const currentBlock = await logseq.Editor.getCurrentBlock()
    const [username, repo] = currentBlock.content.split(",").map(item => item.trim())

    const newBlocks = await render_github_recent_pull_request_to_blocks(username, repo, new Date(monday));
    newBlocks.forEach(b => {
        logseq.Editor.insertBlock(currentBlock.uuid, b.content, {
            sibling: false,
        })
    })
}

const render_github_url = (url: string, renderRepoName: boolean = true, html: boolean = true) => {
    const parsed = parseGithubUrl(url)
    if (parsed == null) {
        return `<a target="_blank" href="${url}" class="external-link">INVALID URL</a>`
    }

    let content = renderRepoName ? `${parsed.repo.owner}/${parsed.repo.repo}` : ""
    
    switch (parsed.type) {
    case 'repo':
        break
    case 'discuss':
    case 'pr':
    case 'issue':
        content += `#${parsed.number}`
        if (!html) {
            content = '\\' + content
        }
        if (parsed.comment != null) {
            content += "(comment)"
        }
        break
    case 'commit':
        content += `@${parsed.hash}`
        break
    }

    if (html) {
        return `<a target="_blank" href="${url}" class="external-link">${content}</a>`
    } else {
        return `\[${content}](${url})`
    }
}

const render_github_recent_pull_request_to_blocks = async (username: string, repo: string, mergedPrAfter: Date) => {
    const token = logseq.settings["github_access_token"];
    if (token == null) {
        throw new Error("Github access token is not set")
    }

    const client = new GithubClient(token)
    const opened_pr = await client.list_all_opened_pr_in_repo(username, repo)
    const merged_pr = await client.list_recent_merged_pr_in_repo(username, repo, mergedPrAfter)

    let blocks = []
    opened_pr.forEach((activity: any) => {
        let tag = ""
        if (activity.isDraft) {
            tag = "\[WIP]"
        } else if (activity.state == "OPEN") {
            tag = "\[REVIEW]"
        }
        blocks.push({
            content: `${tag} ${activity.title.replaceAll('#', '\\#')}${render_github_url(activity.url, false, false)}`
        })
    })
    merged_pr.forEach((activity: any) => {
        let tag = "\[DONE]"
        blocks.push({
            content: `${tag} ${activity.title.replaceAll('#', '\\#')}${render_github_url(activity.url, false, false)}`
        })
    })

    return blocks
}

const renderGithubIssuesToBlocks = async (repo: string, query: string) => {
    const token = logseq.settings["github_access_token"];
    if (token == null) {
        throw new Error("Github access token is not set")
    }

    const client = new GithubClient(token)
    const issues = await client.list_all_issues(repo, query)

    return issues.map((issue: any) => {
        return {
            content: `TODO [\#${issue.number}](${issue.url}) ${issue.title.replaceAll('#', '\\#')}`,
            properties: {
                // properties will be converted to camelCase by logseq
                "issue_number": issue.number,
            }
        }
    })
}

async function main () {
    logseq.Editor.registerSlashCommand('Github Url', github_url_slash_command)
    logseq.Editor.registerSlashCommand('Github Last Week Pull Request', github_lastweek_pull_request_slash_command)

    logseq.App.onMacroRendererSlotted(({slot, payload}) => {
        const [type, url] = payload.arguments
        if (!type?.startsWith(':githubUrl')) return

        logseq.provideUI({
            slot, reset: true,
            template: render_github_url(url)
        })
    })

    let sync_period = parse(logseq.settings["sync_period"] || "5m", "ms");

    const sync_issues = async () => {
        const blocks = (await logseq.DB.datascriptQuery(`
        [
            :find (pull ?b [*])
            :where
            [?b :block/properties ?p]
            [(get ?p :repo) ?r]
            [(get ?p :query) ?q]
            [(not= ?r "nil")]
            [(not= ?q "nil")]
        ]
        `)).map(block_array => block_array[0]);

        blocks.forEach(async (block: any) => {
            // TODO: get uuid in a better way
            let block_uuid = block.uuid.$uuid$
            let repo = block.properties.repo
            let query = block.properties.query
            let recent_day = block.properties["recent-day"] || 0

            console.log("logseq-github: sync issues", `uuid: ${block_uuid}`)

            if (recent_day > 0) {
                const past = LocalDate.now().atStartOfDay().minusDays(recent_day)
                query += ` updated:>=${past.format(DateTimeFormatter.ISO_LOCAL_DATE)}`
            }

            // `includeChildren` will not only get children, but also clear the children cache
            let target_block = await logseq.Editor.getBlock(block_uuid, {
                includeChildren: true,
            })
            console.log(target_block)
            const blocks = await renderGithubIssuesToBlocks(repo, query)

            let exist_children = target_block.children as Array<BlockEntity> || [] ;
            // remove disappeared issues
            await Promise.all(exist_children.map(async child_block => {
                if (blocks.find(b => b.properties?.issue_number == child_block.properties?.issueNumber) == undefined) {
                    // TODO: support other merge strategy
                    console.log("logseq-github: remove issue", child_block.properties?.issueNumber)
                    await logseq.Editor.removeBlock(child_block.uuid)
                }
            }))
            
            // add new issues
            await Promise.all(blocks.map(async block => {
                if (exist_children.find(child => {
                    return child.properties?.issueNumber == block.properties?.issue_number
                }) == undefined) {
                    // This is a new block
                    console.log("logseq-github: insert issue", block.properties?.issue_number)
                    await logseq.Editor.insertBlock(target_block.uuid, block.content, {
                        sibling: false,
                        properties: block.properties,
                    })
                }
            }))
        })
    };
    console.log("logseq-github: setup interval controller for issues")
    setInterval(sync_issues, sync_period)
    await sync_issues();
}

logseq.ready(main).catch((e) => {
    logseq.App.showMsg(e.message, 'error')
    console.error(e)
})