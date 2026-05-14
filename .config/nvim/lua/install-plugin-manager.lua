local path = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not (vim.uv or vim.loop).fs_stat(path) then
    local repository = 'https://github.com/folke/lazy.nvim.git'
    local result = vim.system({ 'git', 'clone', '--filter=blob:none', '--branch=stable', repository, path }):wait()
    if result.code ~= 0 then
        vim.api.nvim_echo({
            { 'Failed to clone lazy.nvim:\n',  'ErrorMsg' },
            { result.stderr or result.stdout, 'WarningMsg' },
            { '\nPress any key to exit...' },
        }, true, {})
        vim.fn.getchar()
        os.exit(1)
    end
end

vim.opt.rtp:prepend(path)
