# Permission modes

Permission modes control when an agent needs your approval to act. Choose a mode in the message
composer; it applies to that thread.

Set the default for new threads in **Settings → General → New threads → Permissions**.
Projects can override the environment default. New threads use this setting rather than the
mode of the thread you were viewing. The initial default is **Full access**; existing threads
and modes you choose in a draft keep their permissions.

| Mode                  | Behavior                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| **Supervised**        | Requests approval for commands and file changes.                             |
| **Auto-accept edits** | Approves file edits automatically; other actions can still require approval. |
| **Full access**       | Allows commands and edits without approval prompts.                          |

Approve or reject requests in the conversation to let the agent continue. Permission modes do
not prevent the agent from asking questions about the task.

## Pi permissions

Pi's blocking tool hook enforces these modes. Read-only tools can proceed in
**Supervised**. **Auto-accept edits** allows Pi's edit and write tools while asking
before commands and extension tools. **Full access** allows tools without prompts.

Pi does not expose an automatic approval reviewer, so **Auto** is hidden. Existing
threads set to Auto behave as Supervised. Changing modes restarts the Pi session
and resumes its native conversation. See [Pi permissions](./providers-pi.md#permission-modes).
