local current_path = ''
local reads = 0
local writes = 0
local created = {}
local permissions = {}
local written_path
local on_write

package.loaded['nvim-web-devicons'] = {}
vim = {
    bo = { buftype = '' },
    fn = {
        stdpath = function() return '/config' end,
        expand = function(path)
            if path == '%:p' then return current_path end
            return '/history'
        end,
        fnamemodify = function(path, modifier)
            if modifier == ':t' then return path:match('[^/]+$') end
            if modifier == ':h' then return path:match('(.+)/') end
            return path
        end,
        filereadable = function() return 1 end,
        isdirectory = function() return 0 end,
        readfile = function() reads = reads + 1; return { 'dummy content' } end,
        writefile = function(_, path)
            writes = writes + 1
            written_path = path
        end,
        mkdir = function(path, _, mode) created[path] = mode end,
        setfperm = function(path, mode) permissions[path] = mode; return 1 end,
        sha256 = function() return 'dummy hash' end,
    },
    api = {
        nvim_create_augroup = function() return 1 end,
        nvim_create_autocmd = function(_, options) on_write = options.callback end,
    },
    keymap = { set = function() end },
}

local plugins = assert(loadfile('.config/nvim/lua/plugins/file-history.lua'))()
plugins[1].config()

local function check(name, callback)
    reads, writes = 0, 0
    created, permissions = {}, {}
    written_path = nil
    callback()
    print('file-history: ' .. name)
end

for _, path in ipairs({
    '/project/.env', '/project/.env.production', '/project/production.env',
    '/home/example/.aws/credentials', '/home/example/.ssh/id_ed25519',
    '/home/example/.config/gcloud/application_default_credentials.json',
    '/home/example/.config/gh/hosts.yml', '/home/example/.codex/auth.json',
    '/project/kubeconfig', '/project/private.pem', '/project/secrets.json',
    '/project/.credentials.json', '/project/auth.json', '/project/id_rsa',
    '/project/private.key', '/project/private.p12', '/project/private.pfx',
    '/project/secret-config.yaml', '/project/production.env.local',
    '/home/example/.kube/config', '/home/example/.config/op/config',
    '/home/example/.claude/settings.json', '/project/.ENV.PRODUCTION',
    'C:\\Users\\example\\.aws\\credentials',
}) do
    check('excludes ' .. path, function()
        current_path = path
        on_write()
        assert(reads == 0 and writes == 0, 'secret file reached history: ' .. path)
        assert(next(created) == nil, 'secret file created a history directory')
    end)
end

check('saves ordinary source with private directory and file permissions', function()
    current_path = '/project/source.lua'
    on_write()
    assert(reads == 1 and writes == 1, 'ordinary source should keep its history')
    assert(created['/history'] == 448, 'history root must be created with mode 0700')
    assert(created['/history/project'] == 448, 'history directory must use mode 0700')
    assert(permissions['/history'] == 'rwx------', 'history root must stay private')
    assert(permissions[written_path] == 'rw-------', 'history snapshot must use mode 0600')
end)

check('does not archive history snapshots again', function()
    current_path = '/history/project/source.lua.2026-10-24_12-00-00'
    on_write()
    assert(reads == 0 and writes == 0, 'history snapshot reached history')
end)
