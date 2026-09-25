local function explorer_toggle()
    local explorer = Snacks.picker.get({ source = 'explorer' })[1]
    if explorer then
        explorer:close()
    else
        Snacks.explorer()
    end
end

return {
    {
        'folke/snacks.nvim',
        priority = 1000,
        lazy = false,
        opts = {
            explorer = { enabled = true },
            lazygit = { enabled = true },
            picker = {
                enabled = true,
                sources = {
                    -- Carried over from the telescope file_ignore_patterns. Snacks
                    -- already excludes .git, and fd and rg skip ignored paths,
                    -- so node_modules only matters where it is not ignored.
                    files = { exclude = { '.git', 'node_modules' } },
                    grep = { exclude = { '.git', 'node_modules' } },
                    -- Show recent files from the current project only
                    recent = { filter = { cwd = true } },
                    explorer = {
                        -- nvim-tree was configured to hide neither dotfiles
                        -- nor git-ignored files
                        hidden = true,
                        ignored = true,
                    },
                },
            },
        },
        keys = {
            { '<leader><space>', function() Snacks.picker.recent() end,         desc = 'Recent files' },
            { '<leader>ff',      function() Snacks.picker.files() end,          desc = 'Find files' },
            { '<leader>fg',      function() Snacks.picker.grep() end,           desc = 'Live grep' },
            { '<leader>fr',      function() Snacks.picker.recent() end,         desc = 'Recent files' },
            { '<leader>ft',      function() Snacks.picker.todo_comments() end,  desc = 'Find todo comments' },
            { '<leader>fu',      function() Snacks.picker.lsp_references() end, desc = 'Find references' },

            { '<C-t>',           explorer_toggle,                              desc = 'Tree toggle',    mode = { 'n', 'x' } },
            { '<leader>tt',      explorer_toggle,                              desc = 'Tree toggle',    mode = { 'n', 'x' } },
            { '<leader>tf',      function() Snacks.explorer.reveal() end,       desc = 'Reveal in tree', mode = { 'n', 'x' } },

            { '<leader>gg',      function() Snacks.lazygit() end,              desc = 'LazyGit' },
        },
    },
}
