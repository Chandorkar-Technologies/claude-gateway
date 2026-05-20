const fs = require("fs");
const Parser = require("tree-sitter");

const JavaScript =
  require("tree-sitter-javascript");

const parser = new Parser();

parser.setLanguage(JavaScript);

function parseFile(path) {

  const code =
    fs.readFileSync(path, "utf8");

  const tree =
    parser.parse(code);

  return tree.rootNode.toString();
}

module.exports = {
  parseFile,
};
