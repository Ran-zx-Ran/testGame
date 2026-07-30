# 第三方素材清单

## 已纳入项目

| 素材 | 本地路径 | 来源 | 授权 |
| --- | --- | --- | --- |
| MediaPipe Pose Landmarker Lite | `public/models/pose_landmarker_lite.task` | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | Apache License 2.0 |
| MediaPipe Vision WASM | `public/mediapipe/wasm/` | npm 包 `@mediapipe/tasks-vision` | Apache License 2.0 |
| Lucide 图标 | npm 包 `lucide` | `https://lucide.dev/` | ISC License |
| Phaser 游戏引擎 | npm 包 `phaser` | `https://phaser.io/` | MIT License |

## 角色与场景说明

当前菜单、场景、水果、英雄和怪兽均由项目内 CSS 或 Phaser 图形代码绘制，不包含远程热链，也没有纳入授权状态不明的网络角色图片。角色名称仅用于用户要求的个人学习演示；公开发布或商用前应完成单独的商标与角色授权审查。

Wikimedia Commons 素材接口在开发环境中多次出现连接重置，无法可靠获得图片与授权元数据，因此没有把来源不明的搜索图片写入仓库。`src/config.ts` 中的 `AssetManifest` 接口已保留，可在取得有权使用的本地素材后登记来源并替换程序化视觉。
