package digital.camer.soma.desktop

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    acquireMulticastLock()
  }

  // The embedded soma-daemon peer (libp2p, spawned from the Rust host) does
  // mDNS discovery over UDP multicast — see `backend/crates/peer/src/
  // behaviour.rs`. Android's Wi-Fi power-saving filter silently drops
  // *incoming* multicast packets for the whole process unless something
  // holds an acquired `WifiManager.MulticastLock`; the
  // `CHANGE_WIFI_MULTICAST_STATE`/`ACCESS_WIFI_STATE` manifest permissions
  // (see AndroidManifest.xml) only make the lock available to request, they
  // don't apply it. `mdns::tokio::Behaviour::new` opens its multicast
  // socket from pure Rust with no route to `WifiManager`, so the lock has
  // to be acquired from the Kotlin side instead, once, for the process's
  // lifetime.
  //
  // Best-effort by design, matching `behaviour.rs`'s "degrade, don't
  // block startup" policy for this same failure mode on other platforms:
  // if a device has no `WifiManager` (rare, e.g. some TV/emulator images)
  // or the lock call throws, mDNS peer discovery just won't find anything
  // on the local network — it must not stop the daemon or the app from
  // starting.
  private fun acquireMulticastLock() {
    try {
      val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      if (wifiManager == null) {
        Log.w(TAG, "no WifiManager on this device; mDNS local-network peer discovery will not work")
        return
      }
      val lock = wifiManager.createMulticastLock("$packageName:mdns")
      lock.setReferenceCounted(false)
      lock.acquire()
      multicastLock = lock
      Log.i(TAG, "multicast lock acquired for mDNS peer discovery")
    } catch (e: Exception) {
      Log.w(TAG, "failed to acquire multicast lock; mDNS local-network peer discovery will not work", e)
    }
  }

  override fun onDestroy() {
    multicastLock?.let { lock ->
      if (lock.isHeld) {
        lock.release()
      }
    }
    multicastLock = null
    super.onDestroy()
  }

  private companion object {
    const val TAG = "SomaMainActivity"
  }
}
