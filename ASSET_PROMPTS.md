# ImageGen 素材提示词记录

本轮计划使用内置 ImageGen 生成菜单、果园和战斗背景，但当前会话没有提供内置 `image_gen` 工具。根据 ImageGen 技能约束，没有自动切换到需要 `OPENAI_API_KEY` 的 CLI 降级路径，也没有伪造生成结果。

当前版本使用项目内 CSS 与 Phaser 图形代码作为可运行视觉。后续具备内置工具时，可使用以下规格生成替换背景：

## 菜单背景

```text
Use case: stylized-concept
Asset type: landscape game menu background
Primary request: a polished 2D arcade arena combining a fruit training court and a distant giant-hero battle city
Composition/framing: 16:9 wide background, clear center area for interface, visible subject detail near both outer thirds
Color palette: charcoal, fresh green, coral red, restrained gold highlights
Constraints: no characters, no text, no logos, no trademarks, no watermark
```

## 切水果背景

```text
Use case: stylized-concept
Asset type: 2D game environment background
Primary request: an evening orchard training court with trees, wooden structures and a warm setting sun
Composition/framing: 16:9 wide view, uncluttered central play area, layered depth
Constraints: no fruit targets, no people, no text, no logos, no watermark
```

## 战斗背景

```text
Use case: stylized-concept
Asset type: 2D game environment background
Primary request: a cinematic ruined city arena at sunset for a giant hero and monster battle
Composition/framing: 16:9 wide view, open central battlefield, distant buildings and haze
Constraints: no characters, no text, no logos, no trademarks, no watermark
```
