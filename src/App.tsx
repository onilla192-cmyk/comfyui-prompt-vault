import { useState } from 'react'
import './App.css'
import { DatasetPage } from './components/DatasetPage'
import { PromptVaultPage, type PromptVaultItem } from './components/PromptVaultPage'
import { importPromptVaultItems } from './promptVaultDb'
import { createCreatedPresets } from './createdPresetsDb'

type Page = 'vault' | 'datasets'

async function moveToCreatedPresets(items: PromptVaultItem[]) {
  await createCreatedPresets(items.map((item) => ({ title: item.name, prompt: item.prompt })))
}

export default function App() {
  const [page, setPage] = useState<Page>('vault')
  return (
    <div className="app">
      <header className="app-header">
        <div><h1>Prompt Vault</h1></div>
        <nav aria-label="Main navigation" className="app-header-actions">
          <button type="button" className={page === 'vault' ? 'active' : ''} onClick={() => setPage('vault')}>Prompt Vault</button>
          <button type="button" className={page === 'datasets' ? 'active' : ''} onClick={() => setPage('datasets')}>Datasets</button>
        </nav>
      </header>
      <main className="app-main">
        {page === 'vault' ? (
          <PromptVaultPage onClose={() => {}} onTransferToCreatedPresets={moveToCreatedPresets} />
        ) : (
          <DatasetPage onClose={() => setPage('vault')} sourceItems={[]} onMoveToVault={importPromptVaultItems} onMoveToCreatedPresets={moveToCreatedPresets} />
        )}
      </main>
    </div>
  )
}
