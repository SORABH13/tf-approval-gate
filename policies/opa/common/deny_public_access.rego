package main

# Example default Rego policy (v0.2). Flags any resource whose planned
# `after` state has publicly_accessible / public_access set true, across
# providers that use that attribute name. Intentionally conservative and
# meant as a starting template -- fork and extend per-org.

deny[msg] {
	rc := input.resource_changes[_]
	after := rc.change.after
	after.publicly_accessible == true
	msg := sprintf("%s is publicly accessible (publicly_accessible = true)", [rc.address])
}

deny[msg] {
	rc := input.resource_changes[_]
	after := rc.change.after
	after.public_access == true
	msg := sprintf("%s is publicly accessible (public_access = true)", [rc.address])
}
