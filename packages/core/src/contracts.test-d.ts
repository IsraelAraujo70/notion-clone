import type { BlockType } from "./contracts"

type Assert<T extends true> = T
type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends
  (<Type>() => Type extends Right ? 1 : 2) ? true : false

type MermaidIsABlockType = Assert<Equal<Extract<BlockType, "mermaid">, "mermaid">>
