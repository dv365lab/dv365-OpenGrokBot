# Linux 桌面双击启动

本机桌面和项目根目录的 `启动OpenGrokBot.desktop` 调用 `deploy/linux/start-desktop.sh`。

- 首次使用若桌面询问是否信任，选择“允许启动”/“标记为可执行”。
- 服务未运行：启动构建好的 gateway，并打开带登录令牌的页面。
- 服务已运行：验证登录后直接打开网页，不重启、不打断任务。
- 连续或同时双击：通过 flock 避免重复启动。
- 端口已有服务但认证失败：报错，不停止或替换那个进程。
- 不安装依赖、不自动构建、不修改模型、数据、共享工作区或通信权限。

## 配置来源

桌面启动通常不继承终端的环境变量。脚本先加载 `~/.bashrc` 中以
`export OPENGROKBOT_...=` 开头的赋值行，再加载可选的
`~/.config/opengrokbot/desktop.env`（后者优先）。两者都是操作者自己的可信 shell 配置；
不要加载来自 bot 工作区的配置。专用配置若含 Key，请设置权限 `chmod 600`，勿提交版本库。
不要把 Key 写入 `.desktop` 文件。

默认使用本机电脑模式和端口 4747。已有进程不会因修改配置而自动重启；
需要切换配置时，先确认没有重要任务，再手动停止旧服务，然后双击启动。

## 文件与日志

默认日志：`gateway/data/server.log`（追加，不覆盖）

默认进程号：`gateway/data/server.pid`

指定 `OPENGROKBOT_DATA` 时，以上文件随数据目录迁移。

快捷方式的 Exec 和 Path 使用当前机器的绝对路径 `/home/icer/try/OpenGrokBot`；
移动项目或复制到另一台机器后需要更新这两个字段。

## 检查

```bash
./deploy/linux/start-desktop.sh --no-browser
```

该命令只执行启动/健康检查，不打开浏览器。需要 Node.js、curl、flock；
打开网页还需要桌面环境和 xdg-open。项目必须已安装依赖并构建。
