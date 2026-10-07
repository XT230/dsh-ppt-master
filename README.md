# @xt230/dsh-ppt-master

English | [中文](#中文)

---

## English

Registers the [PPT Master](https://github.com/hugohe3/ppt-master) skill in every DSH session's skill
catalog and manages the Python interpreter that skill runs on. Configuration uses the plugin's own DSH
`Config` (volatile fields), persisted by DSH into the active profile's `cordis.patch.yml` — the plugin
keeps no configuration file of its own, never installs packages, never edits `PATH`, and never touches a
system interpreter.

### Prerequisites

The plugin drives an upstream checkout; it does not download or install anything for you.

```bash
git clone https://github.com/hugohe3/ppt-master.git
pip install -r ppt-master/requirements.txt
```

### Install

```bash
dsh plugin --profile web add @xt230/dsh-ppt-master
```

The same install is available in the Web GUI through the plugin manager (**Plugins → Add**), with
`@xt230/dsh-ppt-master` as the install spec. The row is activated automatically: a newly installed
dependency that declares `dsh.bundle` is added to the profile's bundle list.

A package that was installed under a **different name** (or replaced in place) is imported by the running
DSH process only after a restart: start `dsh web` again, then refresh the page.

### Use the preset

The bundle declares an agent preset named **PPT Master** (roster id `ppt-master`). Pick it for a session
(the new-session screen, or the preset switcher in an existing one) and that session gets:

- the `ppt-master` skill and the `ppt_master_env` tool — **only** in that preset, because the preset half
  (`./preset`) registers them inside the preset's scope; sessions on other presets do not see either;
- its permissions pinned to the preset's configured value (`presetPermission`, default Full access):
  the skill's own scripts create `0700` temporary directories, which a confined sandbox refuses to write
  into, so the pipeline cannot finish without the wider mode. The pin is recorded in the session, so the
  composer shows the real value and you can still switch it with `/permission`. It is applied when the
  agent is created — a session created with the preset, or one resumed on it — and, for a session
  **switched** to the preset while running, on that session's next message; the composer label can
  therefore still show the previous value until you send one, while no tool ever runs confined.

Everything else stays in the profile: the `ppt-master` row owns the configuration below, the Configure
page, and the read-only environment route, and exposes them to the preset half as the `pptMaster` service.
That split is deliberate — a plugin mounted inside a preset has no editable configuration form.

The preset's plugin list is a **verbatim copy of the shipped `standard` preset** plus this plugin's rows,
because a preset does not inherit another preset. When a dsh release changes `standard`'s list, update
`cordis.patch.yml` to match.

### Configure

**Plugins → @xt230/dsh-ppt-master → the `ppt-master` row → Configure**

| Field | Default | Meaning |
|---|---|---|
| `python` | `""` | Absolute path of the interpreter. Saving executes it once and refuses a path that is not a working Python. Empty means "not configured". |
| `skillDir` | `""` | Directory holding the skill's `SKILL.md`. Empty means "locate it automatically": `~/ppt-master`, `~/Documents/Workspace/ppt-master`, then `$DSH_HOME/ppt-master`. |
| `projectsRoot` | `"workspace"` | Where a session creates its projects: `workspace` uses the directory of the session that starts the work (`<workspace>/projects`, inside that session's writable sandbox), `repo` keeps the checkout's own `projects/`, and any absolute path is used as the root itself. |
| `presetPermission` | `"danger-full-access"` | Permission preset pinned into every session that selects the PPT Master preset. Empty leaves the session's permissions untouched. |

Values are stored in the active profile patch (`$DSH_HOME/profiles/<name>/cordis.patch.yml`) and reach the
running plugin without a restart.

Each project is a self-contained workspace — `sources/`, `svg_output/`, `svg_final/`, `notes/`,
`validation/`, `backup/` — and the delivered deck lands in its `exports/` directory as
`<project>_<HHMMSS>.pptx`. The plugin tells the skill to pass `--dir "<projectsRoot>"` when creating a
project and to read every documented `projects/<name>` path as the absolute `<projectsRoot>/<name>`.

While no interpreter is fixed, the plugin says so in three places: the skill catalog entry is prefixed
`[Python not configured]`, the loaded skill body starts with a warning that forbids running any script, and
the Configure page shows a banner with the validated local candidates. The agent is instructed to ask you
to choose rather than decide for you.

### Agent tool `ppt_master_env`

| action | what it does |
|---|---|
| `status` (default) | Current state (`skill-missing` / `invalid` / `configured` / `unconfigured` / `no-interpreter`), the validated interpreter candidates with their real Python versions, the resolved skill paths, and the next step |
| `probe` | Import-checks the skill's 19 packages on the configured interpreter and reports them by tier (`core` / `optional`) with the capability each one unlocks |
| `set` | Validates and fixes an interpreter path, or clears it with an empty string |

Candidate discovery order: configured value → known virtual environments (`<repo>/.venv`, `$DSH_HOME/ppt-master/venv`, `$DSH_HOME/ppt-master/.venv`, `~/.ppt-master/venv`, `~/.ppt-master/.venv`) → `PATH` (Microsoft Store stubs are skipped) → the Windows launcher registry (`py -0p`, including uv-managed interpreters). Every candidate is really executed once (`<python> -I -B probe.py --quick`) before it is offered.

### What ships

`lib/index.js` (Config, skill provider, tool, read-only environment route), `lib/python.js` (candidate
discovery, validation, probe runner), `lib/skill.js` (frontmatter parsing and the injected runtime
section), `lib/probe.py` (the standard-library-only dependency report), `lib/client.js` (the localized
Configure page), `cordis.patch.yml`, `locale/{en,zh}.json`, `icon.svg`.

The browser half registers one slot, `plugins.row.config`, keyed `<package name>#ppt-master`, and reads and
writes the official configuration through the `form` the Plugins page hands it. A small read-only route,
`POST /ppt-master/env`, only serves candidate discovery, validation and the package check.

### Development

```bash
node dev/selfcheck.mjs        # schema, skill parsing, section assembly, probe, validation
node dev/set-name.mjs --check # the package name is consistent in every place it is hard-coded
```

`dev/` is not part of the published package.

### License

MIT. The upstream skill is MIT-licensed by Hugo He; this package contains no upstream code and reads the
checkout you installed.

---

## 中文

把 [PPT Master](https://github.com/hugohe3/ppt-master) 技能挂进 DSH 的会话技能目录，并管理它使用的
Python 运行时。**配置走 DSH 官方的插件配置通路**：插件声明自己的 `Config`，`python` 与 `skillDir`
是 volatile 字段，由 DSH 写入当前 profile 的 `cordis.patch.yml`，改动不重启插件即可生效。本插件不写
自己的配置文件、不安装任何包、不改 `PATH`、不碰系统解释器。

### 前置条件

上游仓库由你自己准备，插件只负责调用：

```bash
git clone https://github.com/hugohe3/ppt-master.git
pip install -r ppt-master/requirements.txt
```

### 安装

```bash
dsh plugin --profile web add @xt230/dsh-ppt-master
```

也可以走界面：Plugins 页面用插件管理器安装，安装 spec 填 `@xt230/dsh-ppt-master`。安装后会自动激活
（新增的、声明了 `dsh.bundle` 的依赖会被追加进 profile 的 bundles）。

**如果这个包之前是以另一个名字安装的**（或原地替换过），运行中的 DSH 进程需要重启才会导入新的名字：
重新启动 `dsh web`，然后刷新页面。

### 用这个预设

bundle 声明了一个名为 **PPT Master** 的 agent preset（花名册 id `ppt-master`）。新建会话时选它（或在已有
会话里用预设切换器切换），该会话才会得到：

- `ppt-master` 技能与 `ppt_master_env` 工具 —— **只在这个预设下**：preset 半边（`./preset`）把两者注册在
  预设作用域里，其他预设的会话看不到它们；
- 权限被钉到该预设配置的值（`presetPermission`，默认 Full access）：技能脚本会建 `0700` 临时目录，受限
  沙箱拒绝写入，所以不开宽就必然跑不完。这次固定会写进会话记录，输入框**如实显示**真实值，你仍可用
  `/permission` 切走。

其余部分留在 profile：`ppt-master` 行持有配置、Configure 页与只读环境路由，并以 `pptMaster` 服务暴露给
preset 半边。这个拆分是必须的 —— **挂在 preset 里的插件没有可编辑的配置表单**。

预设的插件列表是**照抄上游 `standard` 预设**再追加本插件的行（预设不继承另一个预设）。上游改动
`standard` 列表时，需要同步更新 `cordis.patch.yml`。

### 配置

**Plugins → @xt230/dsh-ppt-master → 行 `ppt-master` → Configure**

| 字段 | 默认 | 说明 |
|---|---|---|
| `python` | `""` | 解释器绝对路径。保存时会真实执行一次，不能运行的路径会被拒绝。留空 = 未配置。 |
| `skillDir` | `""` | 含 `SKILL.md` 的技能目录。留空 = 自动定位（依次找 `~/ppt-master`、`~/Documents/Workspace/ppt-master`、`$DSH_HOME/ppt-master`）。 |
| `projectsRoot` | `"workspace"` | 会话把工程建在哪里：`workspace` = 发起这次任务的会话自己的工作区（`<工作区>/projects`，正好落在该会话可写的沙箱内）；`repo` = 上游仓库自己的 `projects/`；填绝对路径则直接用它作为根目录。 |
| `presetPermission` | `"danger-full-access"` | 钉进每个选择 PPT Master 预设的会话的权限预设。留空 = 不改动会话权限。 |

值存在当前 profile 的 patch（`$DSH_HOME/profiles/<name>/cordis.patch.yml`）里，并即时作用于运行中的插件。

每个工程都是自包含的工作区（`sources/`、`svg_output/`、`svg_final/`、`notes/`、`validation/`、
`backup/`），最终 pptx 落在它自己的 `exports/<项目名>_<HHMMSS>.pptx`。插件会要求技能：创建工程时传
`--dir "<projectsRoot>"`，并把文档里所有 `projects/<name>` 读成绝对路径 `<projectsRoot>/<name>`。

未固定解释器时，插件会在三处提醒：技能目录条目前缀 `[Python not configured]`、加载的技能正文顶部一段
禁止执行脚本的警示、配置页的醒目横幅（含已校验的本机候选）。agent 被要求用 `ask_user_question` 让你
选择，而不是替你决定。

### 模型工具 `ppt_master_env`

| action | 作用 |
|---|---|
| `status`（默认） | 状态机（`skill-missing` / `invalid` / `configured` / `unconfigured` / `no-interpreter`）、校验过的候选解释器（含真实版本）、解析出的技能路径、下一步建议 |
| `probe` | 在生效解释器上逐个 import 19 项依赖，按 `core` / `optional` 分级报告，并说明每项对应的能力 |
| `set` | 校验并固定解释器路径；传空串则清除 |

候选探测顺序：配置值 → 常见虚拟环境（`<repo>/.venv`、`$DSH_HOME/ppt-master/venv`、`$DSH_HOME/ppt-master/.venv`、`~/.ppt-master/venv`、`~/.ppt-master/.venv`）→
`PATH`（剔除 Microsoft Store 存根）→ Windows 启动器注册表（`py -0p`，含 uv 托管解释器）。每个候选都先
真实执行一次（`<python> -I -B probe.py --quick`）才会被列为可用。

### 开发

```bash
node dev/selfcheck.mjs        # schema、技能解析、正文装配、探测、校验
node dev/set-name.mjs --check # 包名在所有硬编码处保持一致
```

`dev/` 不会进入发布包。

### 许可证

MIT。上游技能由 Hugo He 以 MIT 许可发布；本包不含上游代码，只读取你安装的 checkout。
