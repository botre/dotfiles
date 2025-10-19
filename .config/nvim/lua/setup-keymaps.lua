vim.keymap.set('n', '<leader>rf', ':Rename ', { desc = 'Rename File' }) -- The whitespace is intentional
vim.keymap.set('n', '<leader>cp', ':let @+ = expand("%")<CR>', { desc = 'Copy Path' })
