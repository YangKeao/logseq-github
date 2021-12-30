import '@logseq/libs'
import {parseGithubUrl, GithubClient} from './github'

const githubUrlSlachCommand = async () => {
    await logseq.Editor.insertAtEditingCursor(
        `{{renderer :githubUrl}}`
    )
}

const githubLastWeekPullRequestSlachCommand = async () => {
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

    const newBlocks = await renderGithubRecentPullRequestToBlocks(username, repo, new Date(monday));
    newBlocks.forEach(b => {
        logseq.Editor.insertBlock(currentBlock.uuid, b.content, {
            sibling: false,
        })
    })
}

const renderGithubUrl = (url: string, renderRepoName: boolean = true, html: boolean = true) => {
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

const renderGithubRecentPullRequestToBlocks = async (username: string, repo: string, mergedPrAfter: Date) => {
    const token = logseq.settings["github_access_token"];
    if (token == null) {
        throw new Error("Github access token is not set")
    }

    const client = new GithubClient(token)
    const openedPr = await client.listAllOpenedPRInRepo(username, repo)
    const mergedPr = await client.listRecentMergedPRInRepo(username, repo, mergedPrAfter)

    let blocks = []
    openedPr.forEach((activity: any) => {
        let tag = ""
        if (activity.isDraft) {
            tag = "\[WIP]"
        } else if (activity.state == "OPEN") {
            tag = "\[REVIEW]"
        }
        blocks.push({
            content: `${tag} ${activity.title.replaceAll('#', '\\#')}${renderGithubUrl(activity.url, false, false)}`
        })
    })
    mergedPr.forEach((activity: any) => {
        let tag = "\[DONE]"
        blocks.push({
            content: `${tag} ${activity.title.replaceAll('#', '\\#')}${renderGithubUrl(activity.url, false, false)}`
        })
    })

    return blocks
}

const renderGithubIssues = async (repo: string, query: string) => {
    const token = logseq.settings["github_access_token"];
    if (token == null) {
        throw new Error("Github access token is not set")
    }

    const client = new GithubClient(token)
    const issues = await client.listAllIssues(repo, query)

    let ui = "<ul>"
    issues.forEach((issue: any) => {
        ui += `
            <li>${issue.title}</li>
        `
    })
    ui += "</ul>"
    return ui
}

function main () {
    logseq.Editor.registerSlashCommand('Github Url', githubUrlSlachCommand)
    logseq.Editor.registerSlashCommand('Github Last Week Pull Request', githubLastWeekPullRequestSlachCommand)

    logseq.App.onMacroRendererSlotted(({slot, payload}) => {
        const [type, url] = payload.arguments
        if (!type?.startsWith(':githubUrl')) return

        logseq.provideUI({
            slot, reset: true,
            template: renderGithubUrl(url)
        })
    })

    logseq.App.onMacroRendererSlotted(async ({slot, payload}) => {
        let [type, repo, query, recent] = payload.arguments
        if (!type?.startsWith(':githubIssues')) return

        if (recent && recent.length > 0) {
            const pastDay = parseInt(recent)
            const now = new Date()
            now.setDate(now.getDate() - pastDay)
            query += ` updated:>=${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
        }
        logseq.provideUI({
            slot, reset: true,
            template: await renderGithubIssues(repo, query)
        })
    })
}

logseq.ready(main).catch((e) => {
    logseq.App.showMsg(e.message, 'error')
    console.error(e)
})