import { GraphQLClient } from 'graphql-request'
import { getSdk, Sdk } from './generated/graphql'

type GithubRepo = {
    owner: string,
    repo: string,
}

type GithubRepoUrl = {
    type: 'repo',

    repo: GithubRepo,
}

type GithubPRUrl = {
    type: 'pr',

    repo: GithubRepo,
    number: number,
    comment: null | string,
}

type GithubIssueUrl = {
    type: 'issue',

    repo: GithubRepo,
    number: number,
    comment: null | string,
}

type GithubDiscussUrl = {
    type: 'discuss',

    repo: GithubRepo,
    number: number,
    comment: null | string,
}

type GithubCommitUrl = {
    type: 'commit',

    repo: GithubRepo,
    hash: string,
}

type GithubUrl = GithubPRUrl | GithubIssueUrl | GithubDiscussUrl | GithubRepoUrl | GithubCommitUrl;

export const parseGithubUrl = (rawUrl: string): GithubUrl | null => {
    const url = new URL(rawUrl)
    if (url.host !== "github.com") return null
    if (url.hostname !== "github.com") return null

    const path = url.pathname.split('/').filter(part => part.length > 0)
    if (path.length < 2) return null

    const repo: GithubRepo = {
        owner: path[0],
        repo: path[1],
    }
    // the length of url is greater or equal than 2
    if (path.length === 2) {
        return {
            type: 'repo',
            repo,
        }
    } else if (path.length === 3) {
        // the url is a list for PR or issue or discussion
        return null
    } else if (path[2] === 'pull') {
        let comment: null | string = null
        if (url.hash.startsWith("#issuecomment-")) {
            comment = url.hash.slice("#issuecomment-".length)
        }
        return {
            type: 'pr',
            repo,
            number: parseInt(path[3], 10),
            comment,
        }
    } else if (path[2] === 'issues') {
        let comment: null | string = null
        if (url.hash.startsWith("#issuecomment-")) {
            comment = url.hash.slice("#issuecomment-".length)
        }
        return {
            type: 'issue',
            repo,
            number: parseInt(path[3], 10),
            comment,
        }
    } else if (path[2] === 'discussions') {
        let comment: null | string = null
        if (url.hash.startsWith("#discussioncomment-")) {
            comment = url.hash.slice("#discussioncomment-".length)
        }
        return {
            type: 'discuss',
            repo,
            number: parseInt(path[3], 10),
            comment,
        }
    } else if (path[2] === 'commit') {
        return {
            type: 'commit',
            repo,
            hash: path[3],
        }
    } else {
        // unhandled url pattern
        // e.g. https://github.com/<owner>/<repo>/pulls
    }
    return null
}

export class GithubClient {
    client: Sdk

    constructor(token: string) {
        const graphqlClient = new GraphQLClient('https://api.github.com/graphql', {
            headers: {
                authorization: `Bearer ${token}`,
            },
        })
        this.client = getSdk(graphqlClient)
    }

    async listAllIssues(repo: string, query: string) {
        const limit = 20

        let issues = []
        let afterId = null
        while(true) {
            const response = await this.client.getIssues({
                query: query + ` repo:${repo}`,
                first: limit,
                after: afterId,
            })
            issues = issues.concat(response.search.edges.map(edge => edge.node))

            if (response.search.edges.length < limit) {
                break
            } else {
                const lastEdge = response.search.edges[response.search.edges.length - 1]
                afterId = lastEdge.cursor
            }
        }

        return issues
    }

    async list_recent_merged_pr_in_repo(username: string, repo: string, after: Date) {
        const limit = 20

        let prs = []
        let afterId = null
        while(true) {
            const response = await this.client.getPullRequestDetail({
                query: `author:${username} repo:${repo} is:merged is:pr`,
                first: limit,
                after: afterId,
            })
            const recentMergedPr = response.search.edges.map(edge => edge.node).filter((node: any) => new Date(node.mergedAt) > after)
            prs = prs.concat(recentMergedPr)

            if (recentMergedPr.length < limit) {
                break
            } else {
                const lastEdge = response.search.edges[response.search.edges.length - 1]
                afterId = lastEdge.cursor
            }
        }

        return prs
    }

    async listAllOpenedPRInRepo(username: string, repo: string) {
        const limit = 20

        let prs = []
        let afterId = null
        while(true) {
            const response = await this.client.getPullRequestDetail({
                query: `author:${username} repo:${repo} is:open is:pr`,
                first: limit,
                after: afterId
            })
            prs = prs.concat(response.search.edges.map(edge => edge.node))

            if (response.search.edges.length < limit) {
                break
            } else {
                const lastEdge = response.search.edges[response.search.edges.length - 1]
                afterId = lastEdge.cursor
            }
        }

        return prs
    }
}