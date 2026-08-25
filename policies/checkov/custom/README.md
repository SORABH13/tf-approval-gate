# Custom Checkov checks

Drop custom Python or YAML Checkov checks here (see
https://www.checkov.io/3.Custom%20Policies/Python%20Custom%20Policies.html).
This directory is passed to Checkov via `--external-checks-dir` on every
`tf_policy_check` / `tf_propose_change` / `tf_request_approval` call. Empty
by default -- Checkov's built-in Terraform-plan checks run regardless.
