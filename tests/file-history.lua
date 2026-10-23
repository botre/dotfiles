local current_path = ''
local reads = 0
local writes = 0
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
        writefile = function() writes = writes + 1 end,
        mkdir = function() end,
        setfperm = function() return 1 end,
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

for _, path in ipairs({
    '/project/.env', '/project/.env.production', '/project/production.env',
    '/home/example/.aws/credentials', '/home/example/.ssh/id_ed25519',
    '/home/example/.config/gcloud/application_default_credentials.json',
    '/home/example/.config/gh/hosts.yml', '/home/example/.codex/auth.json',
    '/project/kubeconfig', '/project/private.pem', '/project/secrets.json',
}) do
    current_path = path
    on_write()
    assert(reads == 0 and writes == 0, 'secret file reached history')
end

current_path = '/project/source.lua'
on_write()
assert(reads == 1 and writes == 1, 'ordinary source should keep its history')
print('File history privacy checks passed')
