use std::env;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;

use flate2::write::GzEncoder;
use flate2::Compression;
use sha2::{Digest, Sha256};

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=../assets/icons/icon.ico");
    println!("cargo:rerun-if-changed=../assets/icons/icon.png");

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR missing"));
    let embedded_gz = out_dir.join("xray.bin.gz");
    let embedded_sha = out_dir.join("xray.sha256");

    let embed_enabled = env::var("CARGO_FEATURE_EMBED_XRAY").is_ok();
    if embed_enabled {
        let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_else(|_| "windows".to_string());
        let bin_name = if target_os == "windows" { "xray.exe" } else { "xray" };
        let platform_dir = if target_os == "windows" {
            "win32"
        } else if target_os == "macos" {
            "darwin"
        } else {
            "linux"
        };

        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        let candidate = manifest_dir
            .join("..")
            .join("resources")
            .join("bin")
            .join(platform_dir)
            .join(bin_name);

        println!("cargo:rerun-if-changed={}", candidate.display());
        let mut raw = Vec::new();
        File::open(&candidate)
            .unwrap_or_else(|e| panic!("Failed to open {} for embed-xray: {}", candidate.display(), e))
            .read_to_end(&mut raw)
            .expect("Failed reading xray binary");

        let hash = hex::encode(Sha256::digest(&raw));
        fs::write(&embedded_sha, hash).expect("Failed writing xray.sha256");

        let out_file = File::create(&embedded_gz).expect("Failed creating xray.bin.gz");
        let mut encoder = GzEncoder::new(out_file, Compression::best());
        encoder.write_all(&raw).expect("Failed compressing xray binary");
        encoder.finish().expect("Failed finishing gzip");
    } else {
        fs::write(&embedded_gz, b"").ok();
        fs::write(&embedded_sha, b"").ok();
    }

    tauri_build::build();
}
