vim.keymap.set('n', '<leader>rf', ':Rename ', { desc = 'Rename file' }) -- The whitespace is intentional
vim.keymap.set('n', '<leader>cp', ':let @+ = expand("%")<CR>', { desc = 'Copy path' })

-- Quickfix navigation
vim.keymap.set('n', '[q', ':cprevious<CR>', { desc = 'Previous quickfix item' })
vim.keymap.set('n', ']q', ':cnext<CR>', { desc = 'Next quickfix item' })
