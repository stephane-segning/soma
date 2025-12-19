import { Dialog } from "@headlessui/react"
import { motion, AnimatePresence } from "motion/react"

function Modal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <Dialog as="div" className="fixed inset-0 z-50" onClose={onClose}>
          <div className="flex items-center justify-center min-h-screen">
            <Dialog.Title
              as={motion.div}
              className="fixed inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <Dialog.Panel
              as={motion.div}
              className="modal-box bg-base-100"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <Dialog.Title className="text-lg font-bold">
                Hello!
              </Dialog.Title>
              <p className="py-4">This modal uses all three libraries.</p>
            </Dialog.Panel>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
}
