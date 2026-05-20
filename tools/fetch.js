const axios = require("axios");
const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");

async function fetchWebpage(url) {

  const response =
    await axios.get(url);

  const dom =
    new JSDOM(response.data);

  const reader =
    new Readability(dom.window.document);

  const article =
    reader.parse();

  return {
    title: article.title,
    content: article.textContent,
  };
}

module.exports = {
  fetchWebpage,
};
