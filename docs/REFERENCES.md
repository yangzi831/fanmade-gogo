# 开源参考检查

检查时间：2026-10-14。

| 项目                                                            | 本次核对                                     | 本版选择                                                        |
| --------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| [ShareNet-Web](https://github.com/poshithNandyala/ShareNet-Web) | GitHub license API 返回 MIT，文件 LICENSE    | 作为免费分享场景的参考候选；未复制代码或素材                    |
| [GoCart](https://github.com/GreatStackDev/gocart)               | GitHub license API 返回 MIT，文件 LICENSE.md | 作为展示/后台候选；不把其界面提交当作业务后端，未复制代码或素材 |
| [SwapSpot](https://github.com/MasuRii/SwapSpot)                 | license API 返回 404，未获得可核验的授权     | 不复用代码或素材                                                |

后续尝试读取仓库目录时遭遇 GitHub 匿名 API 限流，因此没有声称已审计这些项目的实际提交逻辑。核心库存、免登录预约、互换和归属校验均为本项目独立实现，通过本项目集成测试验证。

后续如要复用，需重新确认具体版本、文件许可、依赖许可、作者素材权利与实际接口；MIT 代码也要保留相应版权和许可声明。

本项目前端插画为自行编写的本地 SVG；图标来自 lucide-react，二维码由 qrcode 生成，依赖版本记录在 package-lock.json。没有下载或复用上述仓库的图片。
