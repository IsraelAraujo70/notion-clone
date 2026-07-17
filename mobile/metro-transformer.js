const path = require("node:path")
const babelTransformer = require("@expo/metro-config/babel-transformer")

module.exports.transform = async function transform(args) {
  const mermaidBundle = path.join("mermaid", "dist", "mermaid.min.js")
  if (args.filename.endsWith(mermaidBundle)) {
    return babelTransformer.transform({
      ...args,
      src: `module.exports = ${JSON.stringify(args.src)};`,
    })
  }

  return babelTransformer.transform(args)
}
