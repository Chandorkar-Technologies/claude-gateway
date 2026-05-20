const simpleGit = require("simple-git");

const git = simpleGit();

async function gitStatus() {
  return await git.status();
}

async function gitDiff() {
  return await git.diff();
}

async function gitCommit(message) {

  await git.add("./*");

  return await git.commit(message);
}

module.exports = {
  gitStatus,
  gitDiff,
  gitCommit,
};
