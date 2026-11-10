// Prevents an additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sponge_bob_tun_lib::run();
}
