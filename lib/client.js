// dsh-ppt-master — browser half: the ppt-master row's Configure page.
//
// The page reads and writes the plugin's official configuration through the
// `form` the Plugins page hands to a `plugins.row.config` entry: the Settings
// service projects the plugin's volatile Config fields, and `form.mutate`
// persists them into the active profile patch. The `/ppt-master/env` route is
// used read-only (candidate discovery, validation, package check).
window.__ModuleLoader__.load({
  id: '@xt230/dsh-ppt-master',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    if (React && React.default && !React.createElement) React = React.default

    var NS = 'pptMaster'
    var ROW_KEY = '@xt230/dsh-ppt-master#ppt-master'
    var ENV_ROUTE = '/ppt-master/env'
    var CSS_ID = 'dsh-ppt-master-css'

    var EN = {
      title: 'PPT Master runtime',
      summary: 'Interpreter',
      notConfigured: 'not configured',
      stateConfigured: 'configured',
      stateUnconfigured: 'not configured',
      stateInvalid: 'invalid',
      stateSkillMissing: 'skill file missing',
      stateNoInterpreter: 'no usable interpreter',
      stateUnknown: 'unknown',
      bannerUnconfigured:
        'No Python interpreter is fixed yet. Pick one below, or ask the agent to check the environment — no script in this skill can run until this is set.',
      bannerInvalid: 'The fixed interpreter no longer runs. Pick another one below.',
      bannerSkillMissing: 'This skill directory has no SKILL.md. Fix the path below.',
      bannerNoInterpreter: 'No usable Python was found. Create an environment first, then pick it below.',
      bannerConfigured: 'Interpreter fixed. Check the packages before generating a deck.',
      bannerUnavailable: 'This profile does not accept configuration writes from the page.',
      python: 'Python interpreter (absolute path)',
      pythonHint: 'Empty means not configured: the agent then probes and asks you to choose.',
      skillDir: 'Skill directory (must contain SKILL.md)',
      skillDirHint: 'Leave empty to locate the checkout automatically (~/ppt-master, ~/Documents/Workspace/ppt-master, $DSH_HOME/ppt-master).',
      projectsRoot: 'Projects root',
      projectsRootHint:
        'workspace = the directory of the session that starts the work (<workspace>/projects, the default); repo = the checkout\'s own projects/; or an absolute path.',
      presetPermission: 'Permission preset for preset sessions',
      presetPermissionHint:
        'Pinned into every session that selects the PPT Master preset. The skill\'s scripts need Full access (their 0700 temp directories are refused by the confined sandbox). Leave empty to leave permissions untouched.',
      resolved: 'Resolved skill directory',
      save: 'Save',
      check: 'Check environment',
      checking: 'Checking…',
      clear: 'Clear interpreter',
      candidates: 'Candidate interpreters',
      candidatesEmpty: 'No interpreter was found on this machine.',
      use: 'Use this',
      packages: 'Packages',
      coreMissing: 'Core packages missing',
      optionalMissing: 'Optional packages missing',
      details: 'Show {n} package rows',
      storedIn: 'Stored in',
      loading: 'Reading the host environment…',
      saved: 'Saved',
      refused: 'The profile refused the write.',
      invalidPython: 'That path is not a usable Python interpreter.',
      requestFailed: 'Request failed',
      probeOk: 'All core packages import.',
      probeBad: 'Core packages are missing — report this and wait; do not install anything automatically.',
    }

    var ZH = {
      title: 'PPT Master 运行环境',
      summary: '解释器',
      notConfigured: '未配置',
      stateConfigured: '已配置',
      stateUnconfigured: '未配置',
      stateInvalid: '无效',
      stateSkillMissing: '缺少技能文件',
      stateNoInterpreter: '没有可用解释器',
      stateUnknown: '未知',
      bannerUnconfigured:
        '还没有固定 Python 解释器。请在下面选一个，或让 agent 检查环境——在此之前这个技能里的脚本都无法运行。',
      bannerInvalid: '已固定的解释器已经无法运行，请在下面重新选择。',
      bannerSkillMissing: '该技能目录下找不到 SKILL.md，请修正下面的路径。',
      bannerNoInterpreter: '本机没有找到可用的 Python。请先创建环境，再在下面选择。',
      bannerConfigured: '解释器已固定。生成 PPT 前建议先检查依赖包。',
      bannerUnavailable: '当前 profile 不接受从页面写入配置。',
      python: 'Python 解释器（绝对路径）',
      pythonHint: '留空即“未配置”：由 agent 探测并询问你选择。',
      skillDir: '技能目录（必须包含 SKILL.md）',
      skillDirHint: '留空即自动定位（~/ppt-master、~/Documents/Workspace/ppt-master、$DSH_HOME/ppt-master）。',
      projectsRoot: '工程根目录',
      projectsRootHint:
        'workspace = 发起这次任务的会话自己的工作区（默认，落在 <工作区>\\projects）；repo = 上游仓库自己的 projects/；也可直接填绝对路径。',
      presetPermission: '预设会话的权限预设',
      presetPermissionHint:
        '会钉进每个选择「PPT Master」预设的会话。技能脚本需要 Full access（它建 0700 临时目录，受限沙箱会拒绝写入）。留空 = 不改动会话权限。',
      resolved: '已解析的技能目录',
      save: '保存',
      check: '检查环境',
      checking: '检查中…',
      clear: '清除解释器',
      candidates: '候选解释器',
      candidatesEmpty: '本机没有找到解释器。',
      use: '用这个',
      packages: '依赖包',
      coreMissing: 'core 缺失',
      optionalMissing: 'optional 缺失',
      details: '展开 {n} 个依赖明细',
      storedIn: '存储位置',
      loading: '正在读取宿主环境…',
      saved: '已保存',
      refused: 'profile 拒绝了这次写入。',
      invalidPython: '该路径不能作为 Python 解释器运行。',
      requestFailed: '请求失败',
      probeOk: '所有 core 依赖都能导入。',
      probeBad: 'core 依赖缺失——请报告并等待用户处理，不要自动安装任何包。',
    }

    var CSS = [
      '.pptm-wrap{display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--dsw-alias-label-primary);max-width:760px}',
      '.pptm-banner{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2)}',
      '.pptm-banner-warn{border-color:var(--dsw-alias-state-warn-primary)}',
      '.pptm-banner-bad{border-color:var(--dsw-alias-state-error-primary)}',
      '.pptm-banner-ok{border-color:var(--dsw-alias-state-success-primary)}',
      '.pptm-banner-title{font-weight:600;font-size:13px}',
      '.pptm-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.pptm-bad{color:var(--dsw-alias-state-error-primary)}',
      '.pptm-ok{color:var(--dsw-alias-state-success-primary)}',
      '.pptm-row{display:flex;flex-direction:column;gap:4px}',
      '.pptm-label{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pptm-hint{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;opacity:.75}',
      '.pptm-input{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;font-family:ui-monospace,Consolas,monospace}',
      '.pptm-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.pptm-btn{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 12px;font-size:13px;font-family:inherit;cursor:pointer}',
      '.pptm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}',
      '.pptm-btn:disabled{opacity:.5;cursor:default}',
      '.pptm-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.pptm-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px}',
      '.pptm-mono{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all}',
      '.pptm-meta{color:var(--dsw-alias-label-secondary);font-size:12px}',
    ].join('')

    function ensureCss() {
      if (typeof document === 'undefined') return function () {}
      if (document.getElementById(CSS_ID)) return function () {}
      var element = document.createElement('style')
      element.id = CSS_ID
      element.textContent = CSS
      document.head.appendChild(element)
      return function () {
        if (element.parentNode) element.parentNode.removeChild(element)
      }
    }

    function call(method, payload) {
      return fetch(ENV_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: method, payload: payload || {} }),
      }).then(
        function (res) {
          return res.json().then(null, function () {
            return { ok: false, message: 'HTTP ' + res.status }
          })
        },
        function (err) {
          return { ok: false, message: String((err && err.message) || err) }
        },
      )
    }

    function merge(base, part) {
      var next = {}
      var key
      for (key in base) if (Object.prototype.hasOwnProperty.call(base, key)) next[key] = base[key]
      for (key in part) if (Object.prototype.hasOwnProperty.call(part, key)) next[key] = part[key]
      return next
    }

    function text(tag, className, content, key) {
      return React.createElement(tag, { className: className, key: key }, content)
    }

    function stateLabel(t, state) {
      if (state === 'configured') return t('stateConfigured')
      if (state === 'unconfigured') return t('stateUnconfigured')
      if (state === 'invalid') return t('stateInvalid')
      if (state === 'skill-missing') return t('stateSkillMissing')
      if (state === 'no-interpreter') return t('stateNoInterpreter')
      return t('stateUnknown')
    }

    function bannerFor(t, state, unavailable) {
      if (unavailable) return { kind: 'bad', text: t('bannerUnavailable') }
      if (state === 'invalid') return { kind: 'bad', text: t('bannerInvalid') }
      if (state === 'skill-missing') return { kind: 'bad', text: t('bannerSkillMissing') }
      if (state === 'no-interpreter') return { kind: 'bad', text: t('bannerNoInterpreter') }
      if (state === 'configured') return { kind: 'ok', text: t('bannerConfigured') }
      return { kind: 'warn', text: t('bannerUnconfigured') }
    }

    function Panel(props) {
      var t = props.t
      var view = props.view
      var form = props.form
      var snapshot = form && form.state ? form.state : { status: 'unavailable', value: undefined, revision: undefined, writable: false }
      var stored = snapshot.value && typeof snapshot.value === 'object' ? snapshot.value : {}
      var unavailable = !form || snapshot.writable === false || snapshot.status === 'unavailable'

      var draftPair = React.useState(null)
      var draft = draftPair[0]
      var setDraft = draftPair[1]
      var envPair = React.useState(null)
      var env = envPair[0]
      var setEnv = envPair[1]
      var busyPair = React.useState(false)
      var busy = busyPair[0]
      var setBusy = busyPair[1]
      var messagePair = React.useState(null)
      var message = messagePair[0]
      var setMessage = messagePair[1]

      var values = {
        python: draft ? draft.python : typeof stored.python === 'string' ? stored.python : '',
        skillDir: draft ? draft.skillDir : typeof stored.skillDir === 'string' ? stored.skillDir : '',
        projectsRoot: draft ? draft.projectsRoot : typeof stored.projectsRoot === 'string' ? stored.projectsRoot : '',
        presetPermission: draft
          ? draft.presetPermission
          : typeof stored.presetPermission === 'string'
            ? stored.presetPermission
            : '',
      }
      var configured = values.python.trim() !== ''
      var state = unavailable ? 'unknown' : env && env.state ? env.state : configured ? 'configured' : 'unconfigured'

      function edit(name, value) {
        setDraft(merge(values, { [name]: value }))
      }

      function refresh(withProbe) {
        setBusy(true)
        setMessage(null)
        call(withProbe ? 'probe' : 'status', { refresh: withProbe === true }).then(function (res) {
          setBusy(false)
          if (res.ok === false) {
            setMessage({ kind: 'bad', text: (res.message || t('requestFailed')) })
            return
          }
          setEnv(res.data || null)
        })
      }

      function save() {
        if (unavailable) return
        setBusy(true)
        setMessage(null)
        var nextPython = values.python.trim()
        var nextSkillDir = values.skillDir.trim()
        var nextProjectsRoot = values.projectsRoot.trim()
        var nextPresetPermission = values.presetPermission.trim()
        var check = nextPython
          ? call('validate', { python: nextPython }).then(function (res) {
              if (res.ok === false) return { bad: res.message }
              if (res.data && res.data.ok === false) return { bad: res.data.error || t('invalidPython') }
              return {}
            })
          : Promise.resolve({})
        check.then(function (verdict) {
          if (verdict.bad) {
            setBusy(false)
            setMessage({ kind: 'bad', text: verdict.bad })
            return
          }
          var ops = [
            { op: 'set', path: ['python'], value: nextPython },
            { op: 'set', path: ['skillDir'], value: nextSkillDir },
            { op: 'set', path: ['projectsRoot'], value: nextProjectsRoot },
            { op: 'set', path: ['presetPermission'], value: nextPresetPermission },
          ]
          return form.mutate(ops, snapshot.revision).then(function (accepted) {
            setBusy(false)
            setDraft(null)
            setMessage(accepted ? { kind: 'ok', text: t('saved') } : { kind: 'bad', text: t('refused') })
            refresh(false)
          })
        }).catch(function (err) {
          setBusy(false)
          setMessage({ kind: 'bad', text: String((err && err.message) || err) })
        })
      }

      function clear() {
        if (unavailable) return
        setBusy(true)
        setMessage(null)
        form.mutate([{ op: 'unset', path: ['python'] }], snapshot.revision).then(
          function (accepted) {
            setBusy(false)
            setDraft(null)
            setMessage(accepted ? { kind: 'ok', text: t('saved') } : { kind: 'bad', text: t('refused') })
            refresh(false)
          },
          function (err) {
            setBusy(false)
            setMessage({ kind: 'bad', text: String((err && err.message) || err) })
          },
        )
      }

      // Read the host environment once per mount and after each accepted write;
      // this page never writes through the route.
      React.useEffect(function () {
        refresh(false)
      }, [snapshot.revision])

      if (view === 'summary') {
        return text('span', 'pptm-meta', t('summary') + ': ' + (configured ? values.python : t('notConfigured')))
      }

      var banner = bannerFor(t, state, unavailable)
      var bannerClass = 'pptm-banner pptm-banner-' + (banner.kind === 'bad' ? 'bad' : banner.kind === 'ok' ? 'ok' : 'warn')
      var candidates = env && env.candidates ? env.candidates : null
      var probe = env && env.probed === true ? env : null

      function field(label, name, hint) {
        return React.createElement(
          'div',
          { className: 'pptm-row', key: name },
          text('label', 'pptm-label', label),
          React.createElement('input', {
            className: 'pptm-input',
            value: values[name] || '',
            spellCheck: false,
            disabled: busy || unavailable,
            onChange: function (event) {
              edit(name, event.target.value)
            },
          }),
          hint ? text('div', 'pptm-hint', hint) : null,
        )
      }

      var children = [
        text('div', 'pptm-banner-title', t('title'), 'title'),
        React.createElement(
          'div',
          { className: bannerClass, key: 'banner' },
          text('div', 'pptm-banner-title', stateLabel(t, state)),
          text('div', 'pptm-hint', banner.text),
        ),
        field(t('python'), 'python', t('pythonHint')),
        field(t('skillDir'), 'skillDir', t('skillDirHint')),
        field(t('projectsRoot'), 'projectsRoot', t('projectsRootHint')),
        field(t('presetPermission'), 'presetPermission', t('presetPermissionHint')),
        React.createElement(
          'div',
          { className: 'pptm-actions', key: 'actions' },
          React.createElement('button', { className: 'pptm-btn pptm-btn-primary', disabled: busy || unavailable, onClick: save }, t('save')),
          React.createElement(
            'button',
            { className: 'pptm-btn', disabled: busy, onClick: function () { refresh(true) } },
            busy ? t('checking') : t('check'),
          ),
          React.createElement('button', { className: 'pptm-btn', disabled: busy || unavailable, onClick: clear }, t('clear')),
          message
            ? text('span', 'pptm-meta ' + (message.kind === 'bad' ? 'pptm-bad' : message.kind === 'ok' ? 'pptm-ok' : 'pptm-warn'), message.text)
            : null,
        ),
        text('div', 'pptm-hint', t('storedIn') + ': ' + ((env && env.configPath) || '—'), 'stored'),
        env && env.skillDir
          ? text(
              'div',
              'pptm-hint',
              t('resolved') + ': ' + env.skillDir + (env.skillDirSource ? ' (' + env.skillDirSource + ')' : ''),
              'resolved',
            )
          : null,
      ]

      if (candidates) {
        children.push(
          React.createElement(
            'div',
            { className: 'pptm-row', key: 'candidates' },
            text('div', 'pptm-label', t('candidates')),
            candidates.length === 0
              ? text('div', 'pptm-hint', t('candidatesEmpty'))
              : React.createElement(
                  'ul',
                  { className: 'pptm-list' },
                  candidates.map(function (item, index) {
                    return React.createElement(
                      'li',
                      { key: String(index) },
                      React.createElement('span', { className: 'pptm-mono' }, item.path),
                      text(
                        'span',
                        'pptm-meta',
                        ' · ' + (item.source || '') + (item.ok ? ' · v' + (item.version || '?') : ' · ' + (item.error || '')),
                      ),
                      item.ok
                        ? React.createElement(
                            'button',
                            {
                              className: 'pptm-btn',
                              style: { marginLeft: '8px', padding: '2px 8px', fontSize: '12px' },
                              disabled: busy || unavailable,
                              onClick: function () {
                                edit('python', item.path)
                              },
                            },
                            t('use'),
                          )
                        : null,
                    )
                  }),
                ),
          ),
        )
      }

      if (probe) {
        var core = probe.coreMissing || []
        var optional = probe.optionalMissing || []
        var packages = probe.packages || []
        children.push(
          React.createElement(
            'div',
            { className: 'pptm-row', key: 'probe' },
            text('div', 'pptm-label', t('packages')),
            text('div', probe.ok ? 'pptm-meta pptm-ok' : 'pptm-meta pptm-bad', probe.ok ? t('probeOk') : t('probeBad')),
            core.length ? text('div', 'pptm-meta pptm-bad', t('coreMissing') + ': ' + core.join(', ')) : null,
            optional.length ? text('div', 'pptm-meta pptm-warn', t('optionalMissing') + ': ' + optional.join(', ')) : null,
            packages.length
              ? React.createElement(
                  'details',
                  null,
                  React.createElement('summary', { className: 'pptm-hint' }, t('details', { n: String(packages.length) })),
                  React.createElement(
                    'ul',
                    { className: 'pptm-list' },
                    packages.map(function (item, index) {
                      return React.createElement(
                        'li',
                        { key: String(index), className: 'pptm-mono' },
                        (item.ok ? '✓ ' : '✗ ') + item.dist + (item.version ? ' ' + item.version : '') + ' — ' + (item.capability || ''),
                      )
                    }),
                  ),
                )
              : null,
          ),
        )
      }

      return React.createElement('div', { className: 'pptm-wrap' }, children)
    }

    function apply(ctx) {
      ctx.inject(['slots', 'locale'], function (child) {
        child.effect(function () {
          return child.locale.register(NS, { zh: ZH, en: EN })
        }, 'ppt-master: locale')
        child.effect(ensureCss, 'ppt-master: styles')
        child.slots.inject('plugins.row.config', function () {
          return child.slots.register({ name: 'plugins.row.config', key: ROW_KEY, locale: NS }, Panel)
        })
      })
    }

    exports.apply = apply
    return module.exports
  },
})
