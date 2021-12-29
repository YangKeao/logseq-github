import '@logseq/libs'

function main () {
    logseq.App.onMacroRendererSlotted(({slot, payload}) => {
        const [type, url] = payload.arguments
        if (!type?.startsWith(':githubUrl')) return

        logseq.provideUI({
            key: "github_url",
            slot, reset: true,
            template: `
            <a target="_blank" href="${url}" class="external-link">Issue URL</a>
            `
        })
    })
}

logseq.ready(main).catch(console.error)