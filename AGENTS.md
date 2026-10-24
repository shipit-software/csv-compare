# CSV Compare contributor instructions

This repository contains an independent public CSV comparison tool. Treat every
tracked file and commit as public. Keep credentials, personal/customer data,
internal planning, private source and unrelated history out of this repository.
Use original synthetic examples. Do not introduce private workspace dependencies.

Use Node.js 22 or newer and its standard library. Run `node --test` in a clean
public-only environment before committing behavior changes. Keep CLI exit codes,
string-preserving values, unique composite-key semantics and JSON output stable.
Document any changed limits or behavior. Retain the relevant product-page link.

Current stage is local development only. Do not add a remote, create a hosted
repository, push or publish a package without the owner's explicit review and
approval of the concrete contents and release. Passing tests does not authorize
publication. Keep local publication hooks installed.

Keep `package.json` marked `private: true` during local development. Remove that
block only as part of an explicitly authorized package release after review of
the exact version and package contents. Repository publication alone does not
authorize a package release.
