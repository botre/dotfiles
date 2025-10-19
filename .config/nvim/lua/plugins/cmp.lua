-- Sources by priority, higher number means higher priority
local sources_by_priority = {
    snippets = 4,
    lsp = 3,
    path = 2,
    buffer = 1
}

local sources_list = {}
for source, _ in pairs(sources_by_priority) do
    table.insert(sources_list, source)
end
table.sort(sources_list, function(a, b)
    return sources_by_priority[a] > sources_by_priority[b]
end)

return {
    {
        'saghen/blink.cmp',
        dependencies = {
            'rafamadriz/friendly-snippets',
        },
        version = '1.*',
        opts = {
            keymap = {
                preset = 'none',
                ['<C-space>'] = { 'show', 'hide' },
                ['<C-e>'] = { 'hide', 'fallback' },
                ['<CR>'] = { 'accept', 'fallback' },
                ['<Tab>'] = { 'select_next', 'snippet_forward', 'fallback' },
                ['<S-Tab>'] = { 'select_prev', 'snippet_backward', 'fallback' },
                ['<Up>'] = { 'select_prev', 'fallback' },
                ['<Down>'] = { 'select_next', 'fallback' },
                ['<C-p>'] = { 'select_prev', 'fallback' },
                ['<C-n>'] = { 'select_next', 'fallback' },
                ['<C-u>'] = { 'scroll_documentation_up', 'fallback' },
                ['<C-d>'] = { 'scroll_documentation_down', 'fallback' },
            },
            appearance = {
                nerd_font_variant = 'mono'
            },
            completion = {
                list = {
                    selection = { auto_insert = false }
                },
                documentation = { auto_show = true }
            },
            sources = {
                default = sources_list,
            },
            fuzzy = {
                implementation = 'prefer_rust_with_warning',
                sorts = {
                    function(a, b)
                        local priority_a = sources_by_priority[a.source_id] or 0
                        local priority_b = sources_by_priority[b.source_id] or 0
                        return priority_a > priority_b
                    end,
                    -- Defaults
                    'score',
                    'sort_text'
                }
            }
        },
        opts_extend = { 'sources.default' },
        config = function(_, opts)
            require('blink.cmp').setup(opts)

            -- Hide copilot suggestions when blink.cmp menu is open
            vim.api.nvim_create_autocmd('User', {
                pattern = 'BlinkCmpMenuOpen',
                callback = function()
                    vim.b.copilot_suggestion_hidden = true
                end,
            })

            vim.api.nvim_create_autocmd('User', {
                pattern = 'BlinkCmpMenuClose',
                callback = function()
                    vim.b.copilot_suggestion_hidden = false
                end,
            })
        end,
    },
}
