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

    await logseq.Editor.insertAtEditingCursor(
        `{{renderer :githubRecentPR, USERNAME, REPO, ${monday} }}`
    )
}

const renderGithubUrl = (url: string, renderRepoName: boolean = true) => {
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
        if (parsed.comment != null) {
            content += "(comment)"
        }
        break
    case 'commit':
        content += `@${parsed.hash}`
        break
    }

    return `<a target="_blank" href="${url}" class="external-link">${content}</a>`
}

const renderGithubRecentPullRequest = async (username: string, repo: string, mergedPrAfter: Date) => {
    // TODO: get token from the settings
    const client = new GithubClient("GITHUB_TOKEN")
    const openedPr = await client.listAllOpenedPRInRepo(username, repo)
    const mergedPr = await client.listRecentMergedPRInRepo(username, repo, mergedPrAfter)

    let content = "<ul>"
    openedPr.forEach((activity: any) => {
        let tag = ""
        if (activity.isDraft) {
            tag = "[WIP]"
        } else if (activity.state == "OPEN") {
            tag = "[REVIEW]"
        }
        content += `<li>
            <span>${tag}</span>
            <span>${activity.title}</span>
            <span>${renderGithubUrl(activity.url, false)}</span>
        </li>`
    })
    mergedPr.forEach((activity: any) => {
        let tag = "DONE"
        content += `<li>
            <span>${tag}</span>
            <span>${activity.title}</span>
            <span>${renderGithubUrl(activity.url, false)}</span>
        </li>`
    })
    content += "</ul>"

    return content
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
        const [type, username, repo, after] = payload.arguments
        if (!type?.startsWith(':githubRecentPR')) return

        logseq.provideUI({
            slot, reset: true,
            template: await renderGithubRecentPullRequest(username, repo, new Date(after))
        })
    })
}

logseq.ready(main).catch(console.error)