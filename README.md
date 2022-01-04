# Logseq Github Plugin

Automatically synchronize the github workflow with logseq.

![screenshot](./static/screenshot.png)

## Settings

An example of the settings is like below:

```yaml
{
  "disabled": false,
  "github_access_token": "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",
  "sync_period": "5m"
}
```

The `github_access_token` is the token to access github API. You can get it in https://github.com/settings/tokens.

`sync_period` is the period of synchronization.

For every block with `repo` and `query` attributions, the plugin will send the query to github API and insert the issue/pr into this block (as children). For example

```markdown
## Pull Request Request for Review
repo:: chaos-mesh/chaos-mesh
query:: is:pr is:open user-review-requested:@me
```

After enabling the plugin, all pull requests waiting for your review will be inserted into the block.

### Attributions

`repo` represents the target repo.

`query` specifies the search query for github. You can read more about the syntax in [Understanding the search syntax](https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax

`recent_day` means to get issues/prs whose updated time is later than "`recent_day`" days ago.

### Suggestion

Every inserted block will be equipped with an attribution: `issue-number`, so you may want to hide the attribution from displaying everywhere. Adding following configuration to your `config.edn` will do the trick:

```
:block-hidden-properties #{:issue-number}
```

## TODO

1. Support more deletion strategy. Don't remove the block (even if they disappear in the query) in some cases.
2. Support richer template mechanism (and remove the `Github Last Week Pull Request` slash command, which is hard to use and understand).