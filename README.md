# Logseq Github Plugin

Automatically synchronize the github workflow with logseq.

![screenshot](./static/screenshot.png)

## Settings

An example of the settings is like below:

```yaml
{
  "disabled": false,
  "github_access_token": "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",
  "issue_block": [
    {
      "block_uuid": "4979c121-ae67-44c8-8831-86a960c96870",
      "sync_period": "PT5M",
      "repo": "chaos-mesh/chaos-mesh",
      "query": "no:assignee is:open is:issue",
      "recent_day": 7
    },
    {
      "block_uuid": "cde0871a-7bc1-4436-ba3f-b2ed14346161",
      "sync_period": "PT5M",
      "repo": "chaos-mesh/chaos-mesh",
      "query": "assignee:YangKeao is:open is:issue"
    },
    {
      "block_uuid": "61ceaf5e-da95-4c12-bafa-42f7cedcded5",
      "sync_period": "PT5M",
      "repo": "chaos-mesh/chaos-mesh",
      "query": "is:pr is:open user-review-requested:@me"
    }
  ]
}
```

The `github_access_token` is the token to access github API. You can get it in https://github.com/settings/tokens.

Every item in `issue_block` will setup a periodical task to synchronize the selected issues/prs into the block. For every task:

`block_uuid` specifies the target block of the synchronization, every issues will be inserted as the children of this block.

`sync_period` is the period of synchronization in joda format. For example, `PT5M` will synchronize for every 5 minutes.

`repo` is the target repo.

`query` is the search query for github. You can read more about the syntax in [Understanding the search syntax](https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax

`recent_day` will only get issues/prs whose updated time is later than "`recent_day`" days ago.

## TODO

1. Writing these configuration in a global settings is not good.
2. Support more deletion strategy. Don't remove the block (even if they disappear in the query) in some cases.
3. Support richer template mechanism (and remove the `Github Last Week Pull Request` slash command, which is hard to use and understand).