# Security

Happy Home is a private family app. If you find a security problem, please report it privately with
GitHub's **Report a vulnerability** button on this repository's **Security** tab, not in a public issue.

What is protected and how:
- Family data lives in Firebase. Its security rules let only the members of a family read or change that family's data,
  and only the account itself read its private cards. The Firebase web key in `firebase-config.js` is meant to be public;
  it identifies the project and gives no access on its own.
- Secrets (the notification helper's code, the Claude connector's key) are kept in GitHub and Vercel settings, never in this repository.
- GitHub code scanning (CodeQL) checks the code on every change and once a week.
