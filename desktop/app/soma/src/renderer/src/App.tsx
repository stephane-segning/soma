import Versions from './components/Versions'
import { CommandPaletteShell } from './components/command-palette'
import { Button } from './components/button'
import { Tooltip } from './components/tooltip'
import { Modal } from './components/modal'
import { useState } from 'react'

function App(): React.JSX.Element {
	const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')
	const [isModalOpen, setIsModalOpen] = useState(false)

	return (
		<>
			<div className="creator">Powered by electron-vite</div>
			<div className="text">
				Build an Electron app with <span className="react">React</span>
				&nbsp;and <span className="ts">TypeScript</span>
			</div>
			<p className="tip">
				Please try pressing <code>F12</code> to open the devTool
			</p>
			<div className="actions">
				<div className="action">
					<a href="https://electron-vite.org/" target="_blank" rel="noreferrer">
						Documentation
					</a>
				</div>
				<div className="action">
					<a target="_blank" rel="noreferrer" onClick={ipcHandle}>
						Send IPC
					</a>
				</div>
			</div>
			<Versions />

			<div className="mt-8 flex flex-wrap items-center gap-4">
				<Tooltip label="Primary action">
					<Button variant="primary" onClick={() => setIsModalOpen(true)}>
						Open modal
					</Button>
				</Tooltip>
				<Button variant="secondary" leadingIcon={<span aria-hidden>⚡</span>} onClick={ipcHandle}>
					Send IPC
				</Button>
				<Button variant="ghost" trailingIcon={<span aria-hidden>↗</span>} onClick={() => window.open('https://soma.camer.digital', '_blank')}>
					Open site
				</Button>
			</div>

			<Modal
				open={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				title="Demo modal"
			>
				<p>Use this modal to preview DaisyUI + Headless UI wiring.</p>
				<p className="mt-2 text-sm opacity-80">
					This component is controlled by parent state; swap in your own content and actions.
				</p>
			</Modal>

			<CommandPaletteShell onSendIpc={ipcHandle} />
		</>
	)
}

export default App
