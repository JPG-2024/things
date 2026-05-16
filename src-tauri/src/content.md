[ggml-org](/ggml-org) / **[llama.cpp](/ggml-org/llama.cpp)** Public

- [Notifications](/login?return_to=%2Fggml-org%2Fllama.cpp) You must be signed in to change notification settings
- [Fork 14.2k](/login?return_to=%2Fggml-org%2Fllama.cpp)
- [Star 91.9k](/login?return_to=%2Fggml-org%2Fllama.cpp)

# guide : running gpt-oss with llama.cpp #15396

[ggerganov](/ggerganov) started this conversation in [Show and tell](/ggml-org/llama.cpp/discussions/categories/show-and-tell)

[guide : running gpt-oss with llama.cpp](#top) #15396

[ggerganov](/ggerganov)

Aug 18, 2025 · 68 comments · 126 replies

[Return to top](#top)

Discussion options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

## [ggerganov](/ggerganov)

[Aug 18, 2025](#discussion-8756116)

Maintainer

Comentario original en inglés - Traducir al español

| NoteThis guide is a live document. Feedback and benchmark numbers are welcome - the guide will be updated accordingly. Overview This is a detailed guide for running the new gpt-oss models locally with the best performance using llama.cpp. The guide covers a very wide range of hardware configurations. The gpt-oss models are very lightweight so you can run them efficiently in surprisingly low-end configurations. Obtaining `llama.cpp` binaries for your system Make sure you are running the latest release of llama.cpp: https://github.com/ggml-org/llama.cpp/releases Obtaining the `gpt-oss` model data (optional) The commands used below in the guide will automatically download the model data and store it locally on your device. So this step is completely optional and provided for completeness. The original models provided by OpenAI are here: https://huggingface.co/openai/gpt-oss-20b https://huggingface.co/openai/gpt-oss-120b First, you need to manually convert them to GGUF format. For convenience, we host pre-converted models here in ggml-org. Pre-converted GGUF models: https://huggingface.co/ggml-org/gpt-oss-20b-GGUF https://huggingface.co/ggml-org/gpt-oss-120b-GGUF TipRunning the commands below will automatically download the latest version of the model and store it locally on your device for later usage. A WebUI chat and an OAI-compatible API will become available on localhost. Sample output of using gpt-oss-120b with the built-in llama-server WebUI Using llama-server with crush coding agent (gpt-oss-20b) Minimum requirements Here are some hard memory requirements for the 2 models. These numbers could vary a little bit by adjusting the CLI arguments, but should give a good reference point. Model Model data (GB) Compute buffers (GB) KV cache per 8 192 tokens (GB) Total @ 8 192 tokens (GB) Total @ 32 768 tokens (GB) Total @ 131 072 tokens (GB) gpt‑oss 20B 12.0 2.7 0.2 14.9 15.5 17.9 gpt‑oss 120B 61.0 2.7 0.3 64.0 64.9 68.5 NoteIt is not necessary to fit the entire model in VRAM to get good performance. Offloading just the attention tensors and the KV cache in VRAM and keeping the rest of the model in the CPU RAM can provide decent performance as well. This is taken into account in the rest of the guide. Relevant CLI arguments Using the correct CLI arguments in your commands is crucial for getting the best performance for your hardware. Here is a summary of the important flags and their meaning: Argument Purpose -hf Specify the Hugging Face model ID to use. The model will be downloaded using curl from the respective model repository -c Specify the context size to use. More context requires more memory. Both gpt-oss models have a maximum context of 128k tokens. Use -c 0 to set to the model's default -ub N -b N Specify the max batch size N during processing. Larger size increases the size of compute buffers, but can improve the performance in some cases -fa Enable Flash Attention kernels. This improves the performance on backends that support the operator --n-cpu-moe N Number of MoE layers N to keep on the CPU. This is used in hardware configs that cannot fit the models fully on the GPU. The specific value depends on your memory resources and finding the optimal value requires some experimentation --jinja Tell llama.cpp to use the Jinja chat-template embedded in the GGUF model file       Apple Silicon Apple Silicon devices have unified memory that is seamlessly shared between the CPU and GPU. For optimal performance it is recommended to not exceed 70% of the total memory that your device has. TipInstall the latest llama.cpp package from Homebrew with: brew install llama.cpp TipTo increase the amount of RAM available to the llama-server process, use the following command: # on a 192GB machine, raise the limit from 154GB (default) to 180GB sudo sysctl iogpu.wired_limit_mb=184320 ✅ Devices with more than 96GB RAM The M2 Max, M3 Max, M4 Max, M1 Ultra, M2 Ultra, M3 Ultra, etc. chips can run both models at full context: llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 🟢 Benchmarks on M3 Ultra (512GB, 80 GPU cores) for `gpt-oss-20b` llama-bench -m gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp2048 2816.47 ± 2.74 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp8192 2308.17 ± 5.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp16384 1879.98 ± 1.99 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp32768 1351.67 ± 4.32 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 tg128 115.52 ± 0.29 build: c8d0d14 (6310) 🟢 Benchmarks on M2 Ultra (192GB, 76 GPU cores) for `gpt-oss-20b` llama-bench -m gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp2048 2191.13 ± 2.65 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp8192 1889.83 ± 3.91 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp16384 1594.51 ± 2.42 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp32768 1218.99 ± 0.44 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 tg128 116.08 ± 0.18 build: 79c1160 (6123) llama-batched-bench -m gpt-oss-20b-mxfp4.gguf -c 132096 -b 2048 -ub 2048 -npp 0,2048,8192,16384,32768 -ntg 128 -npl 1,2,4 PP TG B N_KV T_PP s S_PP t/s T_TG s S_TG t/s T s S t/s 0 128 1 128 0.000 0.00 1.112 115.06 1.113 115.05 0 128 2 256 0.000 0.00 1.601 159.92 1.601 159.91 0 128 4 512 0.000 0.00 2.463 207.85 2.463 207.84 2048 128 1 2176 0.990 2068.28 1.163 110.03 2.154 1010.44 2048 128 2 4352 1.916 2137.49 1.710 149.72 3.626 1200.17 2048 128 4 8704 3.775 2169.82 2.656 192.78 6.431 1353.37 8192 128 1 8320 4.344 1885.93 1.279 100.11 5.622 1479.81 8192 128 2 16640 8.689 1885.52 1.929 132.69 10.619 1567.04 8192 128 4 33280 17.359 1887.62 3.053 167.69 20.413 1630.35 16384 128 1 16512 10.202 1606.01 1.397 91.63 11.599 1423.63 16384 128 2 33024 20.715 1581.82 2.186 117.08 22.902 1441.98 16384 128 4 66048 41.721 1570.80 3.653 140.14 45.375 1455.61 32768 128 1 32896 26.611 1231.39 1.665 76.88 28.276 1163.40 32768 128 2 65792 54.977 1192.06 2.794 91.64 57.771 1138.85 32768 128 4 131584 111.278 1177.88 4.883 104.85 116.161 1132.77 llama-server -hf ggml-org/gpt-oss-120b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 🟢 Benchmarks on M2 Ultra (192 GB, 76 GPU cores) for `gpt-oss-120b` llama-bench -m gpt-oss-120b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend n_ubatch fa test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B Metal 2048 1 pp2048 1244.57 ± 5.10 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B Metal 2048 1 pp8192 1101.31 ± 0.99 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B Metal 2048 1 pp16384 955.41 ± 0.64 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B Metal 2048 1 pp32768 752.31 ± 1.02 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B Metal 2048 1 tg128 79.68 ± 0.12 build: 79c1160 (6123) llama-batched-bench -m gpt-oss-120b-mxfp4.gguf -c 132096 -b 2048 -ub 2048 -npp 0,2048,8192,16384,32768 -ntg 128 -npl 1,2,4 PP TG B N_KV T_PP s S_PP t/s T_TG s S_TG t/s T s S t/s 0 128 1 128 0.000 0.00 1.610 79.48 1.611 79.48 0 128 2 256 0.000 0.00 2.284 112.08 2.284 112.08 0 128 4 512 0.000 0.00 3.477 147.27 3.477 147.27 2048 128 1 2176 1.776 1152.89 1.711 74.82 3.487 623.99 2048 128 2 4352 3.382 1211.16 2.458 104.14 5.840 745.18 2048 128 4 8704 6.505 1259.34 3.747 136.65 10.252 849.02 8192 128 1 8320 7.294 1123.16 1.857 68.94 9.150 909.25 8192 128 2 16640 14.467 1132.48 2.767 92.53 17.234 965.53 8192 128 4 33280 28.801 1137.74 4.358 117.50 33.159 1003.66 16384 128 1 16512 16.580 988.15 2.058 62.18 18.639 885.89 16384 128 2 33024 33.426 980.31 3.174 80.66 36.600 902.29 16384 128 4 66048 67.190 975.39 5.245 97.61 72.435 911.83 32768 128 1 32896 42.075 778.81 2.452 52.20 44.527 738.79 32768 128 2 65792 86.615 756.64 4.029 63.54 90.644 725.83 32768 128 4 131584 173.762 754.32 7.020 72.94 180.782 727.86 ✅ Devices with less than 96GB RAM The small gpt-oss-20b model can run efficiently on Macs with at least 16GB RAM: llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 🟢 Benchmarks on M4 Max (36GB) for `gpt-oss-20b` llama-bench -m gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp2048 1277.42 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp8192 1030.28 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp16384 779.44 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp32768 568.13 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 tg128 92.36 ± 0.00 build: 79c1160 (6123) llama-batched-bench -m gpt-oss-20b-mxfp4.gguf -c 132096 -b 2048 -ub 2048 -npp 0,2048,8192,16384,32768 -ntg 128 -npl 1 PP TG B N_KV T_PP s S_PP t/s T_TG s S_TG t/s T s S t/s 0 128 1 128 0.000 0.00 1.359 94.17 1.359 94.15 2048 128 1 2176 1.676 1222.17 1.450 88.30 3.125 696.26 8192 128 1 8320 7.624 1074.47 1.552 82.47 9.176 906.67 16384 128 1 16512 19.210 852.91 1.669 76.67 20.879 790.84 32768 128 1 32896 55.684 588.46 1.976 64.76 57.661 570.51 🟢 Benchmarks on M1 Max (64GB) for `gpt-oss-20b` llama-bench -m gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp2048 994.75 ± 4.11 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp8192 843.01 ± 2.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp16384 698.82 ± 0.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp32768 497.65 ± 8.92 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 tg128 75.15 ± 0.98 build: 2e2b22b (6180) 🟢 Benchmarks on M1 Pro (32GB) for `gpt-oss-20b` llama-bench -m gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384 model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp2048 515.76 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp8192 437.22 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 pp16384 361.29 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal 2048 1 tg128 45.68 ± 0.00 build: 79c1160 (6123) llama-batched-bench -m gpt-oss-20b-mxfp4.gguf -c 132096 -b 2048 -ub 2048 -npp 0,2048,8192,16384 -ntg 128 -npl 1 PP TG B N_KV T_PP s S_PP t/s T_TG s S_TG t/s T s S t/s 0 128 1 128 0.000 0.00 2.806 45.62 2.806 45.62 2048 128 1 2176 4.054 505.14 3.076 41.61 7.130 305.18 8192 128 1 8320 18.444 444.15 3.329 38.45 21.773 382.12 16384 128 1 16512 44.683 366.67 3.780 33.86 48.464 340.71 ✅ Devices with 16GB RAM Macs don't allow to utilize the full 16GB memory by the GPU, so in this case you have to keep part of the layer on the CPU. Adjust --n-cpu-moe and -c as needed: llama-server -hf ggml-org/gpt-oss-20b-GGUF --n-cpu-moe 12 -c 32768 --jinja --no-mmap 🟥 Devices with 8GB RAM Unfortunately, you are out of luck. The gpt-oss models are not possible to run on Macs with that small amount of memory.       NVIDIA ✅ Devices with more than 64GB VRAM With more than 64B VRAM, you can run both models by offloading everything (both the model and the KV cache) to the GPU(s). llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 🟢 Benchmarks on RTX Pro 6000 Max-Q (96GB) for `gpt-oss-20b` llama-bench -m ./gpt-oss-20b-GGUF/gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition, compute capability 12.0, VMM: yes model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp2048 9480.55 ± 44.01 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp8192 8921.62 ± 4.21 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp16384 8196.12 ± 19.16 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp32768 7050.35 ± 12.36 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 tg128 249.96 ± 0.99 build: f08c4c0 (6199) 🟢 Benchmarks on RTX Pro 6000 (96GB) for `gpt-oss-20b` llama-bench -m ./gpt-oss-20b-GGUF/gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Workstation Edition, compute capability 12.0, VMM: yes model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp2048 11521.95 ± 26.03 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp8192 10673.03 ± 22.35 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp16384 9772.06 ± 19.59 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 pp32768 8267.46 ± 15.58 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 2048 1 tg128 286.91 ± 0.22 build: a6d3cfe (6205) llama-server -hf ggml-org/gpt-oss-120b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 🟢 Benchmarks on RTX Pro 6000 Max-Q (96GB) for `gpt-oss-120b` llama-bench -m ./gpt-oss-120b-mxfp4/gpt-oss-120b-mxfp4-00001-of-00003.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition, compute capability 12.0, VMM: yes model size params backend n_ubatch fa test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp2048 4494.20 ± 20.87 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp8192 4327.73 ± 16.04 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp16384 4114.04 ± 12.84 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp32768 3718.01 ± 19.67 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 tg128 170.62 ± 0.47 build: f08c4c0 (6199) 🟢 Benchmarks on RTX Pro 6000 (96GB) for `gpt-oss-120b` llama-bench -m ./gpt-oss-120b-mxfp4/gpt-oss-120b-mxfp4-00001-of-00003.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Workstation Edition, compute capability 12.0, VMM: yes model size params backend n_ubatch fa test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp2048 5518.07 ± 31.18 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp8192 5315.65 ± 21.91 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp16384 5012.78 ± 24.18 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 pp32768 4503.36 ± 31.57 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 2048 1 tg128 196.31 ± 0.14 build: a6d3cfe (6205) ✅ Devices with less than 64GB VRAM In this case, you can fit the small gpt-oss-20b model fully in VRAM for optimal performance. llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 🟢 Benchmarks on NVIDIA GeForce RTX 3090 (24GB) for `gpt-oss-20b` $ ${LLAMA_BUILD}/bin/llama-bench -m ${LLAMA_CACHE}/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 4096 -ub 2048,4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 3090, compute capability 8.6, VMM: yes, CUDA 12.4 model size params backend n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp2048 5170.56 ± 14.10 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp8192 4771.74 ± 12.96 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp16384 4289.11 ± 3.22 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp32768 3577.10 ± 2.09 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 tg128 161.77 ± 0.56 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp2048 5142.90 ± 26.50 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp8192 4711.52 ± 4.47 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp16384 4245.67 ± 5.30 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp32768 3539.35 ± 2.47 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 tg128 161.95 ± 0.49 build: a094f38 (6210) 🟢 Benchmarks on NVIDIA GeForce RTX 4090 (24GB) for `gpt-oss-20b` $ ${LLAMA_BUILD}/bin/llama-bench -m ${LLAMA_CACHE}/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 4096 -ub 2048,4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 4090, compute capability 8.9, VMM: yes, CUDA 12.6 model size params backend n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp2048 8022.33 ± 161.33 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp8192 7264.73 ± 69.07 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp16384 6298.35 ± 94.91 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp32768 5112.35 ± 34.90 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 tg128 221.95 ± 6.34 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp2048 8078.28 ± 39.37 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp8192 6715.17 ± 204.96 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp16384 6025.25 ± 66.75 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp32768 4924.71 ± 26.63 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 tg128 225.22 ± 0.10 build: a094f38 (6210) 🟢 Benchmarks on NVIDIA GeForce RTX 4080 SUPER (16GB) for `gpt-oss-20b` llama-bench -m 'gpt-oss-20b-mxfp4.gguf' -fa 1 -b 2048,4096 -ub 2048,4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 4080 SUPER, compute capability 8.9, VMM: yes model size params backend ngl n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp2048 8170.95 ± 10.83 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp8192 7989.22 ± 48.54 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp16384 7517.93 ± 11.39 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp32768 6739.51 ± 12.77 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 tg128 186.51 ± 0.33 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp2048 8145.36 ± 47.93 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp8192 7992.03 ± 22.22 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp16384 7560.80 ± 8.81 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp32768 6720.33 ± 21.73 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 tg128 185.68 ± 0.24 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp2048 8120.09 ± 23.07 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp8192 7942.44 ± 7.77 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp16384 7532.66 ± 12.13 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp32768 6735.01 ± 7.80 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 tg128 186.17 ± 0.34 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp2048 8110.85 ± 35.28 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp8192 7510.58 ± 22.65 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp16384 7222.12 ± 6.87 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp32768 6478.02 ± 2.87 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 tg128 186.37 ± 0.59 build: 009b709 (6316) 🟢 Benchmarks on NVIDIA GeForce RTX 5060 Ti (16GB) for `gpt-oss-20b` $ ${LLAMA_BUILD}/bin/llama-bench -m ${LLAMA_CACHE}/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 4096 -ub 2048,4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 5060 Ti, compute capability 12.0, VMM: yes model size params backend n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp2048 3839.21 ± 6.79 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp8192 3695.85 ± 6.09 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp16384 3472.60 ± 1.82 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp32768 3078.06 ± 0.62 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 tg128 111.51 ± 0.05 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp2048 3821.18 ± 13.28 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp8192 3591.27 ± 1.45 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp16384 3385.30 ± 2.44 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp32768 3009.63 ± 2.82 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 tg128 111.56 ± 0.02 build: 9ef6b0b (6208) 🟢 Benchmarks on NVIDIA GeForce RTX 5070 Ti (16GB) for `gpt-oss-20b` $ ${LLAMA_BUILD}/bin/llama-bench -m ${LLAMA_CACHE}/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 4096 -ub 2048,4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 5070 Ti, compute capability 12.0, VMM: yes, CUDA 12.8 model size params backend n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp2048 6339.76 ± 25.60 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp8192 5913.85 ± 9.12 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp16384 5375.41 ± 10.22 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp32768 4547.18 ± 3.70 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 tg128 189.45 ± 0.09 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp2048 6325.97 ± 37.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp8192 5669.50 ± 13.36 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp16384 5193.12 ± 5.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp32768 4411.35 ± 2.43 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 tg128 189.46 ± 0.03 build: a094f38 (6210) 🟢 Benchmarks on NVIDIA GeForce RTX 5080 (16GB) for `gpt-oss-20b` $ ${LLAMA_BUILD}/bin/llama-bench -m ${LLAMA_CACHE}/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 4096 -ub 2048,4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 5080, compute capability 12.0, VMM: yes, CUDA 12.8 model size params backend n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp2048 7476.55 ± 20.89 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp8192 7047.73 ± 19.47 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp16384 6465.65 ± 23.47 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp32768 5531.03 ± 29.67 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 tg128 204.85 ± 0.23 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp2048 7469.28 ± 43.22 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp8192 6725.38 ± 11.03 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp16384 6218.87 ± 25.68 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp32768 5376.58 ± 31.23 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 tg128 204.86 ± 0.04 build: a094f38 (6210) 🟢 Benchmarks on NVIDIA GeForce RTX 5090 (32GB) for `gpt-oss-20b` $ ${LLAMA_BUILD}/bin/llama-bench -m ${LLAMA_CACHE}/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 4096 -ub 2048,4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 5090, compute capability 12.0, VMM: yes, CUDA 12.8 model size params backend n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp2048 9848.38 ± 28.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp8192 8834.14 ± 27.65 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp16384 7802.21 ± 35.06 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 pp32768 6290.76 ± 64.50 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 2048 1 tg128 282.51 ± 0.44 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp2048 9841.15 ± 29.56 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp8192 8482.25 ± 44.45 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp16384 7513.55 ± 34.19 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 pp32768 6089.55 ± 77.41 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 4096 4096 1 tg128 282.26 ± 0.10 build: a094f38 (6210) The large model has to be partially kept on the CPU. 🟡 TODO: add commands for gpt-oss-120b ✅ Devices with 16GB VRAM For example: NVIDIA V100 This config is just at the edge to fit the full context of gpt-oss-20b in VRAM, so we have to restrict the maximum context down to 32k tokens. llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 32768 --jinja -ub 4096 -b 4096 🟢 Benchmarks on NVIDIA V100 (16GB) for `gpt-oss-20b` llama-bench -m gpt-oss-20b-mxfp4.gguf -fa 1 -b 4096 -ub 4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: Tesla V100-PCIE-16GB, compute capability 7.0, VMM: yes model size params backend ngl n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp2048 3526.65 ± 346.86 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp8192 3320.62 ± 44.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp16384 2768.99 ± 19.73 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp32768 2096.44 ± 8.58 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 tg128 117.71 ± 0.30 build: 228f724 (6129) llama-batched-bench -m gpt-oss-20b-mxfp4.gguf -c 33792 -b 4096 -ub 4096 -npp 0,2048,8192,16384,32768 -ntg 128 -npl 1 PP TG B N_KV T_PP s S_PP t/s T_TG s S_TG t/s T s S t/s 0 128 1 128 0.000 0.00 1.106 115.74 1.106 115.72 2048 128 1 2176 0.481 4257.50 1.201 106.60 1.682 1293.82 8192 128 1 8320 2.247 3646.05 1.417 90.31 3.664 2270.69 16384 128 1 16512 5.421 3022.12 1.659 77.14 7.081 2331.96 32768 128 1 32896 15.031 2180.10 2.121 60.35 17.151 1917.98 Running the large gpt-oss-120b model with 16GB of VRAM requires to keep some of the layers on the CPU since it does not fit completely in VRAM: llama-server -hf ggml-org/gpt-oss-120b-GGUF --ctx-size 32768 --jinja -ub 4096 -b 4096 --n-cpu-moe 32 ✅ Devices with less than 16GB VRAM For this config, it is recommended to tell llama.cpp to run the entire model on the GPU while keeping enough layers on the CPU. Here is a specific example with an RTX 2060 8GB machine: # gpt-oss-20b, full context, 22 layers on the CPU llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 --n-cpu-moe 22 # gpt-oss-20b, 32k context, 16 layers on the CPU (faster, but has less total context) llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 32768 --jinja -ub 2048 -b 2048 --n-cpu-moe 16 Note that even with just 8GB of VRAM, we can adjust the CPU layers so that we can run the large 120B model too: # gpt-oss-120b, 32k context, 35 layers on the CPU llama-server -hf ggml-org/gpt-oss-120b-GGUF --ctx-size 32768 --jinja -ub 2048 -b 2048 --n-cpu-moe 35 TipFor more information about how to adjust the CPU layers, see the "Tips" section at the end of this guide.       AMD NoteIf you have AMD hardware, please provide feedback about running the gpt-oss models on it and the performance that you observe. See the sections above for what kind of commands to try and try to adjust respectively. With AMD devices, you can use either the ROCm or the Vulkan backends. Depending on your specific hardware, the results can vary. ✅ RX 7900 XT (20GB VRAM) using ROCm backend llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 🟢 Benchmarks for `gpt-oss-20b` llama-bench -m gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 ROCm devices: Device 0: AMD Radeon RX 7900 XT, gfx1100 (0x1100), VMM: no, Wave Size: 32 model size params backend ngl threads n_batch n_ubatch fa test t/s gpt-oss 20B BF16 12.83 GiB 20.91 B ROCm,RPC 99 1 4096 2048 1 pp2048 4251.56 ± 21.68 gpt-oss 20B BF16 12.83 GiB 20.91 B ROCm,RPC 99 1 4096 2048 1 pp8192 3567.45 ± 11.84 gpt-oss 20B BF16 12.83 GiB 20.91 B ROCm,RPC 99 1 4096 2048 1 pp16384 2948.39 ± 10.34 gpt-oss 20B BF16 12.83 GiB 20.91 B ROCm,RPC 99 1 4096 2048 1 pp32768 2099.25 ± 13.17 gpt-oss 20B BF16 12.83 GiB 20.91 B ROCm,RPC 99 1 4096 2048 1 tg128 101.92 ± 0.27 build: 3007baf (6194) More information: #15396 (comment) ✅ Few more low-end configurations AMD Radeon 890M using Vulkan AMD Radeon FirePro W8100 + AMD Radeon RX 470 using Vulkan       Tips Determining the optimal number of layers to keep on the CPU Good general advice for most MoE models would be to offload the entire model, and use -n-cpu-moe to keep as many MoE layers as necessary on the CPU. The minimum amount of VRAM to do this with the 120B model is about 8GB, below that you will need to start reducing context size and the number of layers offloaded. You can get for example about 30 t/s at zero context on a 5090 with --n-cpu-moe 21. Caveat: on Windows it is possible to allocate more VRAM than available, and the result will be slow swapping to RAM and very bad performance. Just because the model loads without errors, it doesn't mean you have enough VRAM for the settings that you are using. A good way to avoid this is to look at the "GPU Memory" in Task Manager and check that it does not exceed the GPU VRAM. Example on 5090 (32GB): good, --n-cpu-moe 21, GPU Memory < 32: bad, --n-cpu-moe 20, GPU Memory > 32: Using `gpt-oss` + `llama.cpp` with coding agents (such as Claude Code, crush, etc.) Setup the coding agent of your choice to look for a localhost OAI endpoint (see Tutorial: Offline Agentic coding with llama-server #14758) Start llama-server like this: # adjust this command for your hardware llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 0 --jinja -ub 2048 -b 2048 # some agents such as Claude Code can benefit from multiple parallel server slots # note: currently this requires extra memory! llama-server -hf ggml-org/gpt-oss-20b-GGUF --ctx-size 524288 -np 4 --jinja -ub 2048 -b 2048 Sample usage with crush: guide : running gpt-oss with llama.cpp #15396 (reply in thread) Some agents such as Cline and Roo Code do not support native tool calls. A workaround is to use a custom grammar: guide : running gpt-oss with llama.cpp #15396 (comment) Configure the default sampling and reasoning settings When starting a llama-server command, you can change the default sampling and reasoning settings like so: # use recommended gpt-oss sampling params llama-server ... --temp 1.0 --top-p 1.0 # set default reasoning effort llama-server ... --chat-template-kwargs '{"reasoning_effort": "high"}' Note that these are just the default settings and they could be overridden by the client connecting to the llama-server. Frequently asked questions Q: Which quants to use? Always use the original MXFP4 model files. The gpt-oss models are natively "quantized". I.e. they are trained in the MXFP4 format which is roughly equivalent to ggml's Q4_0. The main difference with Q4_0 is that the MXFP4 models get to keep their full quality. This means that no quantization in the usual sense is necessary. Q: What sampling parameters to use? OpenAI recommends: temperature=1.0 and top_p=1.0. Do not use repetition penalties! Some clients tend to enable repetition penalties by default - make sure to disable those. Q: Should I set a chat template file manually? No. The ggml-org/gpt-oss models have a built-in chat template that is used by default. The only reasons to ever want to change the chat template manually are: If there is a bug in the built-in chat template If you have a very specific use case and you know very well what you are doing Known issues Some rough edges in the implementation are still being polished. Here is a list of issue to keep track of: Eval bug: Jinja fails on gpt-oss-120b when using Vulkan #15274 Add support for different reasoning fields #15362 |

Beta Was this translation helpful? [Give feedback.](#)

39 You must be logged in to vote

👍 38 🎉 3 ❤️ 16 🚀 4

All reactions

- 👍 38
- 🎉 3
- ❤️ 16
- 🚀 4

## Replies: 68 comments · 126 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [SteelPh0enix](/SteelPh0enix)

[Aug 18, 2025](#discussioncomment-14143427)

-

| I can provide some numbers for AMD part of the guide. My hardware is RX 7900 XT (20GB VRAM) + Ryzen 9 5900X + 32GB of RAM, running on latest Arch Linux with locally built llama.cpp version 6194 (3007baf), built with ROCm 6.4.1-1 (from official Arch repo) Pulled the gpt-oss-20b repository and converted to GGUF using convert_hf_to_gguf.py, should probably result in the same GGUF file as on huggingface. 7900XT can load the full 20B model with full context without offloading MoE layers to CPU (although barely, because it will fill up the whole VRAM), by running llama-server -m ./gpt-oss-20b.auto.gguf --ctx-size 0 --jinja -b 4096 -ub 4096 -ngl 99 -fa With that, i get generation speeds (as reported by llama.cpp webui) at ~94 tokens/second, slowly going down as the context fills up. I've also tested whether setting K/V cache quantization would help with model size or performance, but the result was... bad, performance was halved and CPU got involved... is this because of mxfp4 format of gpt-oss? I'd also like to note that my PC likes to hang when i fill up my VRAM to the brim, so i've also checked out how gpt-oss-20b behaves when i off-load MoE layers to CPU. When running with all MoE layers on CPU, as below: llama-server -m ./gpt-oss-20b.auto.gguf --ctx-size 0 --jinja -b 4096 -ub 4096 -ngl 99 -fa -cmoe my GPU VRAM usage (as reported by btop) is around 10GB, RAM usage went up only ~2GB. However, the performance took a major 80% hit, as now my generation speed is in ~20tok/s - CPU takes most of the load. If you have better CPU and faster RAM (i'm still running dual-channel DDR4s @ 3200MHz CL16, mind you), you probably will get better results. I wonder how X3Ds behave in that case... I assume that gpt-oss-20b has 24 MoE layers, so let's see how it behaves when i load only, let's say, 4 onto CPU: llama-server -m ./gpt-oss-20b.auto.gguf --ctx-size 0 --jinja -b 4096 -ub 4096 -ngl 99 -fa -ncmoe 4 VRAM is at 18GB (previously it was at 19, as reported by btop, so there's a decrease), RAM usage went up by around 1.5GB, generation speed is ~60tok/s. Neat, this is usable. How about 8 layers? llama-server -m ./gpt-oss-20b.auto.gguf --ctx-size 0 --jinja -b 4096 -ub 4096 -ngl 99 -fa -ncmoe 8 In that case, i get 16GB VRAM usage, ~1.5GB RAM bump as previously, and generation speed went down to 38 tokens/s. Still pretty usable. How about 16 layers? llama-server -m ./gpt-oss-20b.auto.gguf --ctx-size 0 --jinja -b 4096 -ub 4096 -ngl 99 -fa -ncmoe 16 VRAM: 13GB, RAM: as previously, not more than 2GB, generation speed: 27-25tok/s, this is getting pretty bad. As mentioned before - your results may vary, i'm not running current-gen top-tier hardware and IIRC the largest performance bottleneck will be the RAM/PCIe link speed anyway - i'm pretty curious to see what the performance with this GPU is on more recent platform, especially with an X3D CPU. |

Beta Was this translation helpful? [Give feedback.](#)

5 You must be logged in to vote

❤️ 12

All reactions

- ❤️ 12

11 replies

     Show 6 previous replies

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [aldehir](/aldehir) [Aug 18, 2025](#discussioncomment-14144697)

Collaborator

-

| I had issues with a higher batch/ubatch size than the default but I'm not seeing that problem anymore so that was probably user error on my end. I believe you are likely hitting the case where the model needs the CoT from the past tool call but the client isn't sending it in or there is a mismatch in the reasoning field. That is an open issue across all client and inference servers/providers with GPT-OSS. If you can collect any dumps of this happening, I'm happy to dig in further. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/SteelPh0enix)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [SteelPh0enix](/SteelPh0enix) [Aug 18, 2025](#discussioncomment-14144716)

-

| @SteelPh0enix I've been able to get crush to work with moderate success. Can you share the llama-server command line arguments you pass in? Sure @aldehir, here's my config for this model in crush.json: "providers": { "llamacpp": { "type": "openai", "base_url": "http://steelph0enix.pc:51536/v1", "name": "Llama.cpp", "id": "llamacpp", "models": [ { "id": "gpt-oss-20b.auto", "name": "GPT-OSS 20B", "context_window": 131072, "default_max_tokens": 51200, "has_reasoning_efforts": true, "can_reason": true, "supports_attachments": false, "default_reasoning_effort": "high", "cost_per_1m_in": 0, "cost_per_1m_in_cached": 0, "cost_per_1m_out": 0, "cost_per_1m_out_cached": 0 } ] } } // ... my llama-server invocation: llama-server --ctx-size 0 --model gpt-oss-20b.auto.gguf --alias "gpt-oss-20b.auto" --jinja i keep most of my llama-server settings in env vars, as following: export LLAMA_ARG_HOST="0.0.0.0" export LLAMA_ARG_PORT="51536" export LLAMA_ARG_BATCH=2048 export LLAMA_ARG_UBATCH=2048 export LLAMA_ARG_SWA_FULL=false export LLAMA_ARG_KV_SPLIT=false export LLAMA_SET_ROWS=1 # for ARG_KV_SPLIT=false to work export LLAMA_ARG_FLASH_ATTN=true export LLAMA_ARG_MLOCK=true export LLAMA_ARG_NO_MMAP=false export LLAMA_ARG_N_GPU_LAYERS=999 export LLAMA_OFFLINE=true export LLAMA_ARG_ENDPOINT_SLOTS=true export LLAMA_ARG_ENDPOINT_PROPS=true I've opened my test project (a Rust app) with gpt-oss-20b as chosen model in Crush and told it to initialize the project... and it seems to work just fine now! I've tested Crush back on 0.6.0 (or 0.6.1) with gpt-oss, if not on 0.5.x, and i definitely had issues (for example, the chat description below CRUSH logo contained gpt-oss chat template tags...) so you must've fixed it already - i just haven't noticed :) Thanks! If you want, you may add my piece of crush.json to the post as a config example (change the IP to localhost though ;) ) @ggerganov, the invocation from the original post should work just fine |

Beta Was this translation helpful? [Give feedback.](#)

❤️ 1

All reactions

- ❤️ 1

[](/SteelPh0enix)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [SteelPh0enix](/SteelPh0enix) [Aug 18, 2025](#discussioncomment-14144740)

-

| I had issues with a higher batch/ubatch size than the default but I'm not seeing that problem anymore so that was probably user error on my end. I believe you are likely hitting the case where the model needs the CoT from the past tool call but the client isn't sending it in or there is a mismatch in the reasoning field. I believe that's an open issue across all client and inference servers/providers with GPT-OSS. If you can collect any dumps of this happening, I'm happy to dig in further. Yes, i think i did notice that on some other models, i've been mostly working with Qwen... If this happens again, how can i get some more logs/info? Oh, and one potential "issue" i've just noticed - i've set my reasoning in model config to "high", but crush seem to force "minimal", is this "by design", or is it some issue? |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [aldehir](/aldehir) [Aug 18, 2025](#discussioncomment-14144771)

Collaborator

-

| I can't say, but it likely has no effect since llama-server only respects the chat_template_kwargs.reasoning_effort field in the request. I doubt crush is setting it, so it defaults to "medium" unless you change it via command line. I usually run mitmproxy in the background, but enabling verbose and searching for parse errors in the server log will likely show the root of the problem--if there is one. |

Beta Was this translation helpful? [Give feedback.](#)

👍 1

All reactions

- 👍 1

[](/SteelPh0enix)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [SteelPh0enix](/SteelPh0enix) [Aug 18, 2025](#discussioncomment-14144884)

-

| btw @ggerganov i think you made a mistake labeling my test results, i don't have a mac, and they sure don't use AMD GPUs anymore 😄 |

Beta Was this translation helpful? [Give feedback.](#)

😄 1

All reactions

- 😄 1

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [gcp](/gcp)

[Aug 18, 2025](#discussioncomment-14145210)

-

| Configure the default sampling and reasoning settings When starting a llama-server command, you can change the default sampling and reasoning settings like so: # use recommended gpt-oss sampling params llama-server ... --temp 1.0 --top-p 1.0 Q: What sampling parameters to use? OpenAI recommends: temperature=1.0 and top_p=1.0. The problem I see is that the llama-server defaults are --samplers SAMPLERS samplers that will be used for generation in the order, separated by ';' (default: penalties;dry;top_n_sigma;top_k;typ_p;top_p;min_p;xtc;temperature) --temp N temperature (default: 0.8) --top-k N top-k sampling (**default: 40**, 0 = disabled) --top-p N top-p sampling (default: 0.9, 1.0 = disabled) --min-p N min-p sampling (**default: 0.1**, 0.0 = disabled) So the above command is actually equivalent to: llama-server ... --temp 1.0 --top-p 1.0 --top-k 40 --min-p 0.1 Which seems quite a bit different from the actual recommendation from OpenAI. Notably "min-p 0.1" will prune a lot of low-probability tokens, whereas the OpenAI recommendation is basically to follow the model output probabilities. If you look at a lot of guides and settings for other SOTA LLM, they all recommend min-p 0.01 or 0.00. Should the command line be changed to: llama-server ... --temp 1.0 --top-p 1.0 --top-k 0 --min-p 0.0 |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

👍 6

All reactions

- 👍 6

8 replies

     Show 3 previous replies

[](/ggerganov)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ggerganov](/ggerganov) [Aug 19, 2025](#discussioncomment-14150666)

Maintainer Author

-

| Regardless of the OpenAI recommendation, I still think it's a good idea to filter low-probability tokens (for example with Top-K or Min-P). For now, I've updated the guide with the following paragraph: Be careful when you disable the `Top K` sampler. Although recommended by OpenAI, this can lead to significant CPU overhead and small but non-zero probability of sampling low-probability tokens. We can revisit if we determine that sampling from the full vocab is actually important. |

Beta Was this translation helpful? [Give feedback.](#)

👍 2

All reactions

- 👍 2

[](/SmallAndSoft)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [SmallAndSoft](/SmallAndSoft) [Aug 19, 2025](#discussioncomment-14151832)

-

| then top_n_sigma with the default parameter of 1. This isn't supported in llama-server. (A number of claims in top-n-sigma paper fall flat when temperature is applied last, as is the case for llama.cpp, so I'm not sure this is going to change any time soon) Not sure what you mean. The support was merged in #13264 Temperature can be applied at any step you want if you define your own sampling chain. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/gcp)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [gcp](/gcp) [Aug 19, 2025](#discussioncomment-14152217)

-

| I still think it's a good idea to filter low-probability tokens (for example with Top-K or Min-P). Yes, that seems quite sensible. Note that the default will have both top-k 40 and min-p 0.1. The support was merged in #13264 Looks like a bug crept in there, I'll file an issue. Temperature can be applied at any step you want if you define your own sampling chain. Yes, and if you put it last like llama.cpp does by default, you don't have some of the key problems that sampler is supposed to fix 😀 |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/Spyro000)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [Spyro000](/Spyro000) [Aug 29, 2025](#discussioncomment-14250524)

-

| Using min-p 0.0 causes significant performance losses: from 57 tokens per second at min-p 0.1 down to 35 tokens per second at min-p 0.0. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/Tom94)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [Tom94](/Tom94) [Aug 29, 2025](#discussioncomment-14251775)

-

| That's to be expected. I'd recommend min-p 0.01 or even min-p 0.001 for behavior that's close enough to 0 with performance close to the default. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [QuantiusBenignus](/QuantiusBenignus)

[Aug 18, 2025](#discussioncomment-14145339)

-

| To fill better the low-end CUDA edge cases, here are some benchmarks for gpt-oss-20B (both MXFP4 and Unsloth UD quant) on 12GB VRAM: Ryzen 7 5700X with 32GB RAM (PCIe 4), NVIDIA RTX3060, 12GB VRAM, with CUDA 13.0: llama.cpp build: 6139 Optimal settings at 16K context window: Comparing -ncmoe N vs. offloading just some of the later up-projection layers, e.g. -ot "\.([2-9][0-9])\.ffn_up_exps.=CPU". My reasoning was that front of NN is more 'expensive' to offload due to early layers seeing the full sequence - more work per token. In practice, not huge difference in my scenario: ❯llama-server -t 8 -m redacted/gpt-oss-20b-UD-Q4_K_XL.gguf -ngl 99 -fa -c 16384 --min-p 0.0 --temp 1.0 --top-p 1.0 --top-k 0.0 --jinja --reasoning-format none --no-mmap -ot "\.([2-9][0-9])\.ffn_up_exps.=CPU" (Leaves about 600 MB VRAM budget, with 67 tok/sec initial generation rate) or ❯llama-server -t 8 -m redacted/gpt-oss-20b-mxfp4.gguf -ngl 99 -fa -c 16384 --min-p 0.0 --temp 1.0 --top-p 1.0 --top-k 0.0 --jinja --reasoning-format none --no-mmap -ncmoe 2 (Leaves about 600 MB VRAM budget, with 64 tok/sec initial generation rate) Optimal settings at 32K context window: ❯llama-server -t 8 -m redacted/gpt-oss-20b-UD-Q4_K_XL.gguf -ngl 99 -fa -c 32768 --min-p 0.0 --temp 1.0 --top-p 1.0 --top-k 0.0 --jinja --reasoning-format none --no-mmap -ot "\.([1-9][0-9])\.ffn_up_exps.=CPU" (Leaves about 1.2 GB VRAM budget, with 53 tok/sec initial generation rate) or ❯llama-server -t 8 -m redacted/gpt-oss-20b-mxfp4.gguf -ngl 99 -fa -c 32768 --min-p 0.0 --temp 1.0 --top-p 1.0 --top-k 0.0 --jinja --reasoning-format none --no-mmap -ncmoe 3 (Leaves about 600 MB VRAM budget, with 56 tok/sec initial generation rate - this is too aggresive, will likely OOM before reaching context limit.) #llama-bench for gpt-oss-20b-mxfp4.gguf: bin❯master❯./llama-bench -m redacted/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384 -ot "\.([1-9][0-9])\.ffn_up_exps.=CPU" ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 3060, compute capability 8.6, VMM: yes &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; n_ubatch &#124; fa &#124; ot &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -------: &#124; -: &#124; --------------------- &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; pp2048 &#124; 2229.95 ± 1.93 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; pp8192 &#124; 2108.57 ± 6.36 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; pp16384 &#124; 1960.34 ± 2.08 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; tg128 &#124; 30.64 ± 0.08 &#124; #gpt-oss-20b-UD-Q4_K_XL.gguf (Unsloth) bin❯master❯./llama-bench -m redacted/gpt-oss-20b-UD-Q4_K_XL.gguf -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384 -ot "\.([1-9][0-9])\.ffn_up_exps.=CPU" ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 3060, compute capability 8.6, VMM: yes &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; n_ubatch &#124; fa &#124; ot &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -------: &#124; -: &#124; --------------------- &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B Q4_K - Medium &#124; 11.04 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; pp2048 &#124; 2212.30 ± 4.04 &#124; &#124; gpt-oss ?B Q4_K - Medium &#124; 11.04 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; pp8192 &#124; 2092.57 ± 6.44 &#124; &#124; gpt-oss ?B Q4_K - Medium &#124; 11.04 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; pp16384 &#124; 1948.17 ± 0.93 &#124; &#124; gpt-oss ?B Q4_K - Medium &#124; 11.04 GiB &#124; 20.91 B &#124; CUDA &#124; 99 &#124; 1 &#124; 2048 &#124; 1 &#124; \.([1-9][0-9])\.ffn_up_exps.=CPU &#124; tg128 &#124; 31.30 ± 0.07 &#124; build: 6139 Similar results for latest build: 6195. For completeness, when running with a small context window of 2048 tokens ( when everything fits in the GPU, i.e. no offloading), the inference speed reaches 75 tok/sec. This is not irrelevant even for a reasoning model because there are scenarios where this window is sufficient for one-off tasks. Excellent inference speed with a decent LLM, indeed. |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

All reactions

3 replies

[](/ElliotK-IB)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ElliotK-IB](/ElliotK-IB) [Sep 4, 2025](#discussioncomment-14312584)

-

| -ncmoe N vs. offloading just some of the later up-projection layers, e.g. -ot ".([2-9][0-9]).ffn_up_exps.=CPU" The first section looks like it compares the former on MXFP4 and the latter on UD-Q4_K_XL -- is this intentionally not a "controlled" experiment? Or is it that you're showing the optimal settings in your testing for the MXFPR4 and the UD-Q4_K_XL respectively? Just seeking clarification on what the pairs of results per context window size are for. Is these where you got the GGUF files from? MXFP4: https://huggingface.co/bartowski/openai_gpt-oss-20b-GGUF/blob/main/openai_gpt-oss-20b-MXFP4.gguf Unsloth UD: https://huggingface.co/unsloth/gpt-oss-20b-GGUF/blob/main/gpt-oss-20b-UD-Q4_K_XL.gguf Lastly, how is it that the 32K context with UD-Q4_K_XL leaves 1.2 GB VRAM but 16K only leaves over 600 MB? I'm understanding this as the 32K context left more free VRAM than 16K context. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/QuantiusBenignus)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [QuantiusBenignus](/QuantiusBenignus) [Sep 5, 2025](#discussioncomment-14320810)

-

| Hi @ElliotK-IB, It was meant to save comment space after noticing that the additional partial quantization on the MXFP4 quants by Unsloth introduces no noticeable difference for essentially the same neural network when all run parameters are the same. So this should have tried better to convey that with either model variant, the offload of the chosen up-projection tensors (-ot ) is equivalent to the use of -ncmoe 2 (memory-wise, baring a few t/s tg speed difference), leaving about the same amount of VRAM available on the specific 12GB GPU. The MXFP4 was either from Bartowski or ggml-org. The Unsloth URL is correct, I think. On the second question, the command with 16k context uses less aggressive regexp (20 to 99), while the 32k context would offload also tensors from 10 to 99 (if they existed ) of the up-projections of the feed forward network, thus leaving more VRAM available. (Which is needed for the larger context, about 370 to 400 MB per 16k if not mistaken). Looking at the layer structure of the LLM, actually blanketing everything up to 99 is not necessary. (up to 29 would have sufficed). On that note, a more aggressive regexp to leave a few more of the up-projections in VRAM would be -ot ".(1[7-9]&#124;2[0-4]).ffn_up_exps.=CPU". This offloads from layers 17 to 24, leaving about 600 MB free VRAM (which would not be enough if the full 32k context window is to be used, so -ot ".(1[6-9]&#124;2[0-4]).ffn_up_exps.=CPU" would be living on the absolute edge). Bottom line, this somewhat convoluted text shows optimal (with enough VRAM left for the chosen context window, except maybe in the last case) settings for the hardware in question and suggests that in most cases it is better to offload tensors, not whole expert layers to the CPU/RAM. Assuming no other, unrelated, GPU-intensive, VRAM-gobbling tasks on the system, of course. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/ElliotK-IB)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [ElliotK-IB](/ElliotK-IB) [Sep 5, 2025](#discussioncomment-14324166)

-

| Interesting, I learned about offloading tensors vs layers thanks to your post, glad I asked further. Appreciate the detailed follow-up as well! I'll revisit this and this post I came across on r/LocalLLaMA for my own experiments. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [aldehir](/aldehir)

[Aug 18, 2025](#discussioncomment-14145537)

Collaborator

-

| Several people are having issues with tool calling in Cline/Roo Code when using gpt-oss-20b. This is because those clients do not use native tool calling and the model insists on native tool calls. There is a workaround by using a custom grammar that inhibits native tool calling: root ::= analysis? start final .+ analysis ::= "<&#124;channel&#124;>analysis<&#124;message&#124;>" ( [^<] &#124; "<" [^&#124;] &#124; "<&#124;" [^e] )\* "<&#124;end&#124;>" start ::= "<&#124;start&#124;>assistant" final ::= "<&#124;channel&#124;>final<&#124;message&#124;>" Passing this in a file with --grammar-file yields good results when coupled with this system prompt: Valid channels: analysis, final. Channel must be included for every message. Is this something useful to include in the docs? |

Beta Was this translation helpful? [Give feedback.](#)

6 You must be logged in to vote

👍 10 ❤️ 8 🚀 1

All reactions

- 👍 10
- ❤️ 8
- 🚀 1

5 replies

[](/ggerganov)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ggerganov](/ggerganov) [Aug 19, 2025](#discussioncomment-14150687)

Maintainer Author

-

| Could you ELI5 the difference between native and non-native tool calls? Or point me to a reference document. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [aldehir](/aldehir) [Aug 19, 2025](#discussioncomment-14154278)

Collaborator

-

| Could you ELI5 the difference between native and non-native tool calls? Or point me to a reference document. With native tool calls, the model invokes tools in its own syntax. The inference server is responsible for parsing it and exposing it via the API. For gpt-oss, it generates tool calls in its harmony format through the commentary channel <&#124;channel&#124;>commentary to=functions.get_weather <&#124;constrain&#124;>json<&#124;message&#124;>{"location": "New York"} Other models may place them in tags such as <tool_call></tool_call>. With non-native tool calls, the client prompts the model to respond a certain way to perform a tool call. For example, Cline prompts the model to respond in an XML format. E.g., <get_weather> <location>New York</location> </get_weather> gpt-oss-20b is adamant about producing a native tool call when told it has tools. By constraining the grammar to only produce content and not a tool call, you force it to do a non-native call that Cline/Roo Code expect. Hope that clears things up. |

Beta Was this translation helpful? [Give feedback.](#)

👍 6

All reactions

- 👍 6

[](/ggerganov)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ggerganov](/ggerganov) [Aug 19, 2025](#discussioncomment-14155005)

Maintainer Author

-

| Thanks. Expanded the "Tips" section with a link to this thread. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/maxiedaniels)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [maxiedaniels](/maxiedaniels) [Aug 22, 2025](#discussioncomment-14191580)

-

| @aldehir so if I want to use these models with RooCode + Openrouter via Cerebras or Grok, is it on the provider to fix this or is it on the RooCode developers? |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [aldehir](/aldehir) [Aug 22, 2025](#discussioncomment-14191693)

Collaborator

-

| @maxiedaniels I doubt the providers will adopt this grammar, it really is more of a hack than a fix. I think the appropriate fix for Cline / Roo Code is to adopt native tool calling. Roo Code has an open PR that may be promising. The 120B model should work (mostly) with Cline/Roo Code. It seems to follow instruction quite well, but may fail occasionally. The 20B seems to always fail, and this grammar helps with that. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [Mushoz](/Mushoz)

[Aug 18, 2025](#discussioncomment-14146088)

-

| Are we sure tool calling is currently implemented correctly? Openai has released a test script ( https://cookbook.openai.com/articles/gpt-oss/verifying-implementations ) to test backend implementations, but it's currently failing me with llama.cpp. Steps to run the test script: git clone https://github.com/openai/openai-cookbook.git cd gpt-oss/compatibility-test/ npm install npm i -D tsx typescript @types/node Then edit the providers.ts file (edit the correct details in): export const PROVIDERS = { openai: { apiBaseUrl: "http://localhost:3001/v1", apiKey: "key", apiType: ["chat"], // choose from responses, chat, or both modelName: "GPT-OSS-120B", providerDetails: { // add any provider-specific details here. These will be passed as part of every request // for example to fix the provider for openrouter, you can do: // provider: { // only: ["example"], // }, }, }, }; And then lastly start the test: npm start -- --provider openai These are the results I obtained: Summary: Provider: openai Total input cases: 30 Tries: 1 Total tasks: 29 Total runs: 29 Invalid Chat Completions API responses: 29 (out of 29) pass@k (k=1..1): 1=0.000 pass^k (k=1..1): 1=0.000 pass@k (k=1): 0.000 pass^k (k=1): 0.000 Wrong-input tool calls: 5 Invalid cases.jsonl lines: 0 Expected outcome according to the guide: If your tests are successful, the output should show 0 invalid requests and over 90% on both pass@k and pass^k. This means the implementation should likely be correct. Could anyone try replicating my findings? If they find the same, what should be done to fix this? |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

All reactions

9 replies

     Show 4 previous replies

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [aldehir](/aldehir) [Aug 18, 2025](#discussioncomment-14146430)

Collaborator

-

| Do you happen to have the patch to enable reasoning_content compatibility? Typescript is definitely not my strong suit. I tried changing the if (item.type === "reasoning") { check to if (item.type === "reasoning_content") {, but that didn't work. I can't produce one right this moment, but if you duplicate the validResponse line and change hasReasoningField to hasReasoningContentField, and message.reasoning to message.reasoning_content, it should work. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [aldehir](/aldehir) [Aug 18, 2025](#discussioncomment-14146463)

Collaborator

-

| It does look like they may have intended to pass the test if reasoning_content is set but forgot to add another line. That said, I do think the divergence between projects is problematic for clients. I created the discussion to see if there is community support behind adding a way to change the field. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/0xshivamagarwal)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [0xshivamagarwal](/0xshivamagarwal) [Aug 19, 2025](#discussioncomment-14153940)

-

| I believe there is some issue with the current implementation of tool calling. I used openai/gpt-oss-20b model with both lmstudio (compatibility test: success) & llama-server (compatibility test: failed) [version: 6190 (ae532ea)] and logged the result variable in runCase.ts at line 105. command used to run test and generate output : npm start -- --provider <provider_name> -n 1 -k 1 Attaching output of both for the reference: output-llama-server.log, output-lm-studio.log If you see the output-lm-studio.log, then you will find actual tool call & it's response but the same is not present in the output-llama-server.log file. Please let me know if I did something incorrectly or if I can provide any information that can be helpful in solving this. Also, I don't see any tool calls in the output using lm-studio with ggml-org/gpt-oss-20b-GGUF model. So, I believe they have done some extra handling just for the openai model to support tool calling. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [aldehir](/aldehir) [Aug 19, 2025](#discussioncomment-14154375)

Collaborator

-

| @0xshivamagarwal use --reasoning-format auto. none is no longer the recommendation, so you can opt to remove the option entirely as well (it defaults to auto). |

Beta Was this translation helpful? [Give feedback.](#)

👍 3 ❤️ 3

All reactions

- 👍 3
- ❤️ 3

[](/0xshivamagarwal)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [0xshivamagarwal](/0xshivamagarwal) [Aug 19, 2025](#discussioncomment-14154972)

-

| @aldehir thanks for pointing it out. Tool calling is working perfectly. It's just the API response that needs to be updated to work perfectly with the tests. P.S. Let me know if I should delete the comments to avoid confusion for anyone seeing it in future. |

Beta Was this translation helpful? [Give feedback.](#)

👍 2

All reactions

- 👍 2

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [ericcurtin](/ericcurtin)

[Aug 18, 2025](#discussioncomment-14146610)

Collaborator

-

| Maybe not relevant as the models are kinda large... But perf tested CPU inferencing on an Ampere system before --threads cores/2 was the sweet spot... Also --cache-reuse what are the considerations for use? |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [mounta11n](/mounta11n)

[Aug 18, 2025](#discussioncomment-14146721)

-

| @ggerganov I've tested one more Apple Silicon. Here are the results of my MBP M1 Max 64GB 🟢 Benchmarks on M1 Max (64GB) for gpt-oss-20b time llama-bench -m gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend threads n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp2048 994.75 ± 4.11 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp8192 843.01 ± 2.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp16384 698.82 ± 0.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp32768 497.65 ± 8.92 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 tg128 75.15 ± 0.98 build: 2e2b22b (6180) llama-bench -m gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 10,31s user 2,38s system 2% cpu 10:15,13 total |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

👍 1

All reactions

- 👍 1

4 replies

[](/gsgxnet)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [gsgxnet](/gsgxnet) [Aug 26, 2025](#discussioncomment-14224424)

-

| @ggerganov MBP M3 Max 128GB time llama-bench -m /Users/<user>/Library/Caches/llama.cpp/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend threads n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp2048 1347.72 ± 28.34 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp8192 1040.01 ± 19.65 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp16384 908.13 ± 7.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp32768 530.52 ± 74.68 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 tg128 64.26 ± 0.53 build: e92734d (6250) llama-bench -m -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 8.02s user 5.50s system 2% cpu 8:58.38 total It did only run when I gave the full path to the model file. With just the name llama-bench could not find the model. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/ggerganov)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ggerganov](/ggerganov) [Aug 26, 2025](#discussioncomment-14225207)

Maintainer Author

-

| The tg128 number looks quite low. I think it's possible that this measurement was heat throttled (new macbooks unfortunately do this for some reason). You can run it alone like this: time llama-bench -m /Users/<user>/Library/Caches/llama.cpp/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 0 For example on my M4 Max (36GB) I get this: model size params backend n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 2048 1 tg128 95.88 ± 0.12 build: 8b69686 (6293) |

Beta Was this translation helpful? [Give feedback.](#)

👍 1 👀 1

All reactions

- 👍 1
- 👀 1

[](/gsgxnet)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [gsgxnet](/gsgxnet) [Aug 26, 2025](#discussioncomment-14226792)

-

| Yes the heat throttling seems to be a real big issue with MB Pros, especially with M3 MAX SoC and big RAM. I had found that report #10444 At the moment I fear it is worse than just low inference speed. I will evaluate further with the gpt-oss eval scripts. So far I get really bad results. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/gsgxnet)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [gsgxnet](/gsgxnet) [Aug 26, 2025](#discussioncomment-14226807)

-

| Good benchmark seems to be this with an Mac mini M4 Pro 64 GB: time llama-bench -m /Users/<user>/Library/Caches/llama.cpp/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 model size params backend threads n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp2048 700.78 ± 0.71 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp8192 618.59 ± 0.67 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp16384 534.95 ± 0.54 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 pp32768 419.74 ± 0.27 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Metal,BLAS 1 2048 1 tg128 63.34 ± 0.05 build: 0fd90db (6280) llama-bench -m -ngl 99 -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 6,29s user 2,40s system 1% cpu 13:01,60 total tg128 seems consistent. And all t/s variations are low. Seems the very high variations in the MB Pro results are caused by the throttling. |

Beta Was this translation helpful? [Give feedback.](#)

👍 1

All reactions

- 👍 1

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [Art9681](/Art9681)

[Aug 18, 2025](#discussioncomment-14146850)

-

| Getting the following error when attempting to use @playwright/mcp@latest MCP server. It's working well with other tools. This MCP server works fine with other models such as Devstral so its an issue with the gpt-oss-model implementation: got exception: {"code":500,"message":"JSON schema conversion failed:\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}\nUnrecognized schema: {\"not\":{}}","type":"server_error"} |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

All reactions

3 replies

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [aldehir](/aldehir) [Aug 19, 2025](#discussioncomment-14148127)

Collaborator

-

| I'm not seeing this problem with Chatbox + @playright/mcp@latest. Which client are you using? |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/Art9681)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [Art9681](/Art9681) [Aug 19, 2025](#discussioncomment-14148707)

-

| I'm using the official OpenAI Go SDK. I can enable other MCP servers and internal tool implementations according to spec and they work fine. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/aldehir)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [aldehir](/aldehir) [Aug 19, 2025](#discussioncomment-14149410)

Collaborator

-

| I'm afraid I'm stumped, as I cannot reproduce this with Chatbox or Crush. Neither produce a JSON schema with "not": {} for the playwright MCP server. From what I can tell, not is unsupported, but I'm not equipped to give you a good answer. I recommend creating an issue and maybe someone more knowledgeable can help. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited by ggerganov

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [SoftwareRenderer](/SoftwareRenderer)

[Aug 18, 2025](#discussioncomment-14146983)

-

| Adding benchmarks for NVIDIA > 64 GB VRAM. 🟢 Benchmarks on RTX Pro 6000 Max-Q (96GB) for `gpt-oss-20b` llama-bench -m ./gpt-oss-20b-GGUF/gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition, compute capability 12.0, VMM: yes model size params backend ngl threads n_ubatch fa test t/s gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp2048 9480.55 ± 44.01 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp8192 8921.62 ± 4.21 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp16384 8196.12 ± 19.16 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp32768 7050.35 ± 12.36 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 tg128 249.96 ± 0.99 build: f08c4c0 (6199) 🟢 Benchmarks on RTX Pro 6000 Max-Q (96GB) for `gpt-oss-120b` llama-bench -m ./gpt-oss-120b-mxfp4/gpt-oss-120b-mxfp4-00001-of-00003.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition, compute capability 12.0, VMM: yes model size params backend ngl threads n_ubatch fa test t/s gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp2048 4494.20 ± 20.87 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp8192 4327.73 ± 16.04 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp16384 4114.04 ± 12.84 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp32768 3718.01 ± 19.67 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 tg128 170.62 ± 0.47 build: f08c4c0 (6199) |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

👍 1 🚀 1 👀 1

All reactions

- 👍 1
- 🚀 1
- 👀 1

2 replies

[](/ggerganov)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ggerganov](/ggerganov) [Aug 19, 2025](#discussioncomment-14150833)

Maintainer Author

-

| Thanks for the data! p.s. Accidentally, edited your comment instead of the guide - sorry about that :) |

Beta Was this translation helpful? [Give feedback.](#)

👍 1

All reactions

- 👍 1

[](/SoftwareRenderer)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [SoftwareRenderer](/SoftwareRenderer) [Sep 10, 2025](#discussioncomment-14367805)

-

| It's amazing how the continued performance improvements have added up, even within the short period of the past 3 weeks: 40-50% PP and 15% TG improvement. Incredible work. ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition, compute capability 12.0, VMM: yes model size params backend ngl threads n_ubatch fa test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp2048 6403.85 ± 33.25 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp8192 6404.04 ± 10.92 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp16384 6188.01 ± 7.76 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp32768 5655.75 ± 28.18 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 tg128 197.21 ± 0.44 build: 00681df (6445) |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [kj-c0d3s](/kj-c0d3s)

[Aug 19, 2025](#discussioncomment-14147897)

-

| Since I spent more time than I probably should have, here is some info for the list 🧱 Hardware Specifications 🖥️ CPU Model: AMD Ryzen Threadripper 1950X 16-Core Processor Cores/Threads: 16 cores / 32 threads Base Clock: 2.2 GHz Boost Clock: 3.75 GHz Sockets: 1 NUMA Nodes: 1 (CPUs 0–31) 🧠 Memory (RAM) Total Capacity: 64 GB (4 × 16 GB) Speed: 3200 MT/s Channels: Quad-channel Type: DDR4 🎮 GPUs 5 × AMD Radeon Pro VII (Vega 20 (gfx906: xnack-), 16 GB HBM2 each) GPU ID Memory Vendor VBIOS Version GPU 0 Hynix 113-D1640600-104 GPU 1 Hynix 113-D1640600-104 GPU 2 Hynix 113-D1640600-104 GPU 3 Samsung 113-D1640600-104 GPU 4 Samsung 113-D1640600-104 Total VRAM: 80 GB ECC Support: Enabled IOMMU + HMM/SVM: Enabled (shared virtual memory for ROCm) Firmware & ROCm: Custom-built ROCm HIP stack with Flash attention support to enable functionality outside official compatibility list 🧩 PCIe Configuration Risers: 5 total Bifurcation Cards: 2 × 16x-to-8x dual-split Layout: 3 GPUs on straight x16 risers 2 GPUs connected via bifurcation (x8/x8) splitters 🐧 OS Distribution: Ubuntu 24.04 LTS 🧠 Inference Benchmark Summary 🏃 Run Command ./llama-server \ --model gpt-oss-120b-F16.gguf \ --threads 16 \ --no-mmap \ #Prevents hang at 75% model loading (for me anyway) --flash-attn \ --prio 2 \ --n-gpu-layers 99 \ --temp 1.0 \ --top-p 1.0 \ --top-k 0 \ --min-p 0 \ --no-warmup \ --ubatch-size 2048 \ --jinja \ --chat-template-kwargs '{"reasoning_effort": "medium"}' \ --ctx-size 32768 🔍 Inference Performance: 9K Prompt + Generation (~11.4K tokens total) 📈 Performance Metrics 📤 Prompt Tokenization Tokens: 9044 Time: 77,223.972 ms Speed: ⚡ 117.1 tokens/sec 🧠 Token Generation Tokens: 2381 Time: 134,268.908 ms Speed: 🐢 17.7 tokens/sec ⚙️ Total Workload: ~11,425 tokens Let me know if there is anything else you'd like to see or know that may be helpful to others |

Beta Was this translation helpful? [Give feedback.](#)

3 You must be logged in to vote

🚀 1

All reactions

- 🚀 1

6 replies

     Show 1 previous reply

[](/ggerganov)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ggerganov](/ggerganov) [Aug 19, 2025](#discussioncomment-14150578)

Maintainer Author

-

| The --top-k 0 option is likely slowing text generation a lot. |

Beta Was this translation helpful? [Give feedback.](#)

👍 1 👀 2

All reactions

- 👍 1
- 👀 2

[](/kj-c0d3s)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [kj-c0d3s](/kj-c0d3s) [Aug 20, 2025](#discussioncomment-14157917)

-

| TL;DR same peformance with top-k at default, and at least with my setup split row is much worse performance even though it looks like its taxing the gpus more.. I ran it with no --top-k specified, expecting default 40, running prompt from same entry point as original test: Prompt Tokens: 9044 Time: 77004.813 ms Speed: 117.4 t/s Generation Tokens: 2888 Time: 164342.089 ms Speed: 17.6 t/s switching back for straight compare and adding --split-mode row yields: First yes it definitely burns all GPUs at same time, and slight different loading Prompt Tokens: 9044 Time: 95424.939 ms Speed: 94.8 t/s Generation Tokens: 3041 Time: 212404.812 ms Speed: 14.3 t/s |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/kj-c0d3s)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [kj-c0d3s](/kj-c0d3s) [Aug 20, 2025](#discussioncomment-14158123)

-

| For giggles, I built latest vulkan: Same original prompt entry point: Prompt Tokens: 9044 Time: 433164.602 ms Speed: 20.9 t/s Generation Tokens: 3705 Time: 194148.47 ms Speed: 19.1 t/s is -fa not working or is there something else going on here? wild I get speed up on tg but my pp is abismal... sadge kj |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/kj-c0d3s)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [kj-c0d3s](/kj-c0d3s) [Aug 20, 2025](#discussioncomment-14158606)

-

| silly question @ggerganov - is it possible to use ROCm for prompt processing and Vulkan for token gen? |

Beta Was this translation helpful? [Give feedback.](#)

👀 1

All reactions

- 👀 1

[](/nullnuller)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [nullnuller](/nullnuller) [Aug 23, 2025](#discussioncomment-14195888)

-

| --split-mode row Does it work seamlessly with --tensor-split ? |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [Tom94](/Tom94)

[Aug 19, 2025](#discussioncomment-14153871)

-

| More benchmarks for NVIDIA >64 GB. This one with the workstation edition of the RTX 6000 Pro Blackwell. Crazy how the difference in performance to the 300W Max-Q version is only around 15%. I should start running my GPU at 300W as well to save some energy. 😅 gpt-oss-20b ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Workstation Edition, compute capability 12.0, VMM: yes model size params backend ngl threads n_ubatch fa test t/s gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp2048 11521.95 ± 26.03 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp8192 10673.03 ± 22.35 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp16384 9772.06 ± 19.59 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp32768 8267.46 ± 15.58 gpt-oss ?B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 tg128 286.91 ± 0.22 build: a6d3cfe (6205) gpt-oss-120b ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX PRO 6000 Blackwell Workstation Edition, compute capability 12.0, VMM: yes model size params backend ngl threads n_ubatch fa test t/s gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp2048 5518.07 ± 31.18 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp8192 5315.65 ± 21.91 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp16384 5012.78 ± 24.18 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp32768 4503.36 ± 31.57 gpt-oss ?B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 tg128 196.31 ± 0.14 build: a6d3cfe (6205) Edit: maybe worth noting that my GPU only draws around 390W out of the maximum 600W while running the benchmark. Probably hints at optimization opportunities. |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

👍 2 🚀 1

All reactions

- 👍 2
- 🚀 1

1 reply

[](/SoftwareRenderer)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [SoftwareRenderer](/SoftwareRenderer) [Aug 19, 2025](#discussioncomment-14155177)

-

| Very interesting that it doesn't come anywhere near max power draw for this workload! For reference, the Max-Q version draws around ~250W during pp, and ~280W during tg for this benchmark, measured in nvtop. |

Beta Was this translation helpful? [Give feedback.](#)

👍 2

All reactions

- 👍 2

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [grigio](/grigio)

[Aug 19, 2025](#discussioncomment-14156284)

-

| AMD Ryzen 7 7700 Id Timestamp Model Input Tokens Output Tokens Prompt Processing Generation Speed Duration 12 8/19/2025, 11:11:18 AM gpt-oss-20b-mxfp4 10,897 134 32.71 t/s 9.51 t/s 30.29s /app/llama-server --model /models/gpt-oss-20b-mxfp4.gguf -c 0 -fa --reasoning-format auto --no-warmup --chat-template-kwargs "{\"reasoning_effort\": \"high\"}" --seed 3407 --repeat-penalty 1.05 --jinja --chat-template-file /models/gpt-oss/chat_template.jinja --grammar-file /models/gpt-oss/cline.gbnf --temp 1.0 --top-p 1.0 --top-k 0.0 --min-p 0.0 -ngl 99 --port 9999 model size params backend ngl fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 0 0 pp512 37.07 ± 0.40 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 0 0 pp1024 36.58 ± 0.09 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 0 0 tg128 16.08 ± 0.05 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 0 1 pp512 36.86 ± 0.34 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 0 1 pp1024 36.50 ± 0.23 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 0 1 tg128 12.57 ± 0.02 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 30 0 pp512 42.27 ± 0.26 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 30 0 pp1024 42.17 ± 0.15 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 30 0 tg128 7.08 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 30 1 pp512 41.23 ± 0.44 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 30 1 pp1024 41.03 ± 0.21 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 30 1 tg128 7.11 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 100 0 pp512 42.58 ± 0.27 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 100 0 pp1024 42.52 ± 0.28 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 100 0 tg128 7.22 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 100 1 pp512 41.55 ± 0.32 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 100 1 pp1024 40.97 ± 0.12 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 100 1 tg128 7.26 ± 0.00 |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [Spyro000](/Spyro000)

[Aug 19, 2025](#discussioncomment-14156367)

-

| Thanks for the guide! Here are my results with Nvidia RTX 5070 12 GB, Ryzen 5 9600X, and 64 GB DDR5‑6000: llama-server -hf ggml-org/gpt-oss-20b-GGUF \ --ctx-size 32768 --jinja -ub 2048 -b 2048 -ngl 99 -fa \ --n-cpu-moe 2 --temp 1.0 --top-p 1.0 --top-k 0 --min-p 0.0 Speed: 62.21 tokens per second The 20‑B model itself is working surprisingly well. Has anyone managed to connect it to LangChain? |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

All reactions

5 replies

[](/QuantiusBenignus)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [QuantiusBenignus](/QuantiusBenignus) [Aug 20, 2025](#discussioncomment-14157949)

-

| This is actually quite interesting. Are you sure about the -ub batch size? I also have 12GB of VRAM on a RTX3060 (12288 MB total with 378 MB reserved for the Linux driver) and I cannot fit in the VRAM with those settings at 32K context (including -ncmoe 2). Need to drop -ub to the default of 512 to have 300MB spare. When I do, I get 60 tokens/sec (Ryzen 7 5700X, 32 GB DDR4 RAM). I am surprised that the difference in hardware generations (extra bandwidth of 5070 vs 3060, DDR5 vs DDR4 memory bandwidth etc.) results in such a small performance difference. Could it be the 6 cores of Ryzen 5 9600X vs. the 8 cores of 5700X? (Assuming that the --threads default of -1 automatically chooses the number of cores of the CPU) Edit: CPU is Ryzen 7 5700X, sorry. In any case, the LLM works well, makes a good case to upgrade RAM to 64GB and load its 120B big brother. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/Spyro000)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [Spyro000](/Spyro000) [Aug 20, 2025](#discussioncomment-14161319)

-

| Great results! I'd say the CPU and DDR5 are the bottleneck. When I run the model entirely on VRAM (with a small 2048 context window), I get 128 t/s. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/QuantiusBenignus)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [QuantiusBenignus](/QuantiusBenignus) [Aug 20, 2025](#discussioncomment-14165846)

-

| You are right. The extra compute power and bandwidth of the 5070 over the 3060 shines when there is no GPU to CPU (RAM) data jumps. Inference is almost twice as fast (128 t/s vs. 75 t/s). You should try the 120B with that much RAM and if you don't mind, post the results. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/Spyro000)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [Spyro000](/Spyro000) [Aug 20, 2025](#discussioncomment-14168943)

-

| Not enough memory to run the 120B model reliably. I did manage to start it, though, and got 12t/s. I suppose it would run ok with more RAM. |

Beta Was this translation helpful? [Give feedback.](#)

👍 1

All reactions

- 👍 1

[](/QuantiusBenignus)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [QuantiusBenignus](/QuantiusBenignus) [Aug 21, 2025](#discussioncomment-14172943)

-

| Bought 32GB extra RAM, and ran the unsloth UD-Q4_K_XL quant of gpt-oss-120b with -ncmoe 32 (both mmaped and -no-mmap). In either case I get 15 tok / sec generation and 85 tok / sec pp2048. The -ncmoe 32 setting leaves about 2.6 GB VRAM available on the GPU, but RAM is under moderate pressure with --no-mmap (only 2 GB RAM remains available). For lower RAM pressure let llama-server mmap the file and you should be OK in most cases (lower your swapiness just in case or try with --mlock ). Assuming your total model size is 63GB (the aforementioned quant or the MXFP4 from ggml-org). I think this is a reliable way to run the model, a true mid-tier LLM generating at reading speed on a Linux machine with a low-end NVIDIA GPU. Thank you llama.cpp developers! |

Beta Was this translation helpful? [Give feedback.](#)

❤️ 2

All reactions

- ❤️ 2

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [ceroma](/ceroma)

[Aug 19, 2025](#discussioncomment-14157403)

-

| Some numbers for AMD Ryzen AI 9 HX 370 with Radeon 890M (64GB allocated to VRAM out of 128GB total RAM) using Vulkan: Benchmarks for `gpt-oss-120b` $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-120b-mxfp4-00001-of-00003.gguf -ngl 99 -t 1 -fa 1 -b 2048,4096 -ub 512,1024,2048,4096 -p 2048,8192 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; n_batch &#124; n_ubatch &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; ------: &#124; -------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 512 &#124; 1 &#124; pp2048 &#124; 92.62 ± 2.87 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 512 &#124; 1 &#124; pp8192 &#124; 84.11 ± 0.14 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 512 &#124; 1 &#124; tg128 &#124; 18.98 ± 0.16 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 1024 &#124; 1 &#124; pp2048 &#124; 84.88 ± 0.25 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 1024 &#124; 1 &#124; pp8192 &#124; 81.49 ± 0.32 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 1024 &#124; 1 &#124; tg128 &#124; 19.01 ± 0.10 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 2048 &#124; 1 &#124; pp2048 &#124; 83.67 ± 0.34 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 2048 &#124; 1 &#124; pp8192 &#124; 79.53 ± 0.11 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 2048 &#124; 1 &#124; tg128 &#124; 19.12 ± 0.07 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 4096 &#124; 1 &#124; pp2048 &#124; 83.73 ± 0.24 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 4096 &#124; 1 &#124; pp8192 &#124; 79.40 ± 0.07 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 4096 &#124; 1 &#124; tg128 &#124; 19.28 ± 0.06 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 512 &#124; 1 &#124; pp2048 &#124; 88.26 ± 0.28 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 512 &#124; 1 &#124; pp8192 &#124; 83.43 ± 0.13 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 512 &#124; 1 &#124; tg128 &#124; 19.37 ± 0.09 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 1024 &#124; 1 &#124; pp2048 &#124; 84.85 ± 0.24 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 1024 &#124; 1 &#124; pp8192 &#124; 81.42 ± 0.09 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 1024 &#124; 1 &#124; tg128 &#124; 19.46 ± 0.10 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 2048 &#124; 1 &#124; pp2048 &#124; 83.54 ± 0.36 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 2048 &#124; 1 &#124; pp8192 &#124; 79.29 ± 0.32 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 2048 &#124; 1 &#124; tg128 &#124; 19.54 ± 0.08 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 4096 &#124; 1 &#124; pp2048 &#124; 82.78 ± 0.23 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 4096 &#124; 1 &#124; pp8192 &#124; 74.58 ± 0.07 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 4096 &#124; 1 &#124; tg128 &#124; 19.58 ± 0.02 &#124; build: f08c4c0d (6199) $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-120b-mxfp4-00001-of-00003.gguf -ngl 99 -t 1 -fa 1 -p 0 -n 512,1024 --delay 120 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg512 &#124; 19.78 ± 0.10 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg1024 &#124; 19.08 ± 1.25 &#124; build: f08c4c0d (6199) $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-120b-mxfp4-00001-of-00003.gguf -ngl 99 -t 1 -fa 1 -p 0 -n 2048 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg2048 &#124; 18.21 ± 2.01 &#124; build: f08c4c0d (6199) $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-120b-mxfp4-00001-of-00003.gguf -ngl 99 -t 1 -fa 1 -p 0 -n 4096 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg4096 &#124; 12.38 ± 4.12 build: f08c4c0d (6199) Benchmarks for `gpt-oss-20b` $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 0,1 -p 0 -n 512 --delay 180 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 0 &#124; tg512 &#124; 27.06 ± 0.07 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg512 &#124; 27.48 ± 0.16 &#124; build: f08c4c0d (6199) $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -p 0 -n 128,256,1024,2048,4096 --delay 180 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg128 &#124; 27.67 ± 0.26 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg256 &#124; 27.38 ± 0.10 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg1024 &#124; 26.10 ± 2.62 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg2048 &#124; 26.83 ± 0.09 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg4096 &#124; 17.85 ± 6.01 &#124; build: f08c4c0d (6199) $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -n 0 -p 256,512,1024,2048,4096,8192 --delay 180 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp256 &#124; 244.15 ± 1.59 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp512 &#124; 285.28 ± 3.06 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp1024 &#124; 283.54 ± 0.79 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp2048 &#124; 274.22 ± 2.84 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp4096 &#124; 252.54 ± 11.57 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp8192 &#124; 230.29 ± 8.31 &#124; build: f08c4c0d (6199) $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -b 2048,4096 -ub 512,1024,2048,4096 -n 0 -p 4096 --delay 60 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; n_batch &#124; n_ubatch &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; ------: &#124; -------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 512 &#124; 1 &#124; pp4096 &#124; 252.72 ± 11.14 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 1024 &#124; 1 &#124; pp4096 &#124; 244.87 ± 6.57 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 2048 &#124; 1 &#124; pp4096 &#124; 234.58 ± 6.17 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 2048 &#124; 4096 &#124; 1 &#124; pp4096 &#124; 234.88 ± 6.50 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 512 &#124; 1 &#124; pp4096 &#124; 245.97 ± 9.11 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 1024 &#124; 1 &#124; pp4096 &#124; 245.34 ± 6.65 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 2048 &#124; 1 &#124; pp4096 &#124; 235.12 ± 6.79 &#124; &#124; gpt-oss ?B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 4096 &#124; 4096 &#124; 1 &#124; pp4096 &#124; 216.17 ± 6.05 &#124; build: f08c4c0d (6199) Edit: re-ran benchmarks on latest build as of Sep 15 (tldr: almost 2x increase in t/s for prompt processing) Benchmarks for `gpt-oss-120b` $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-120b-mxfp4-00001-of-00003.gguf -ngl 99 -t 1 -fa 1 -p 1024 -n 512 --delay 180 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss 120B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp1024 &#124; 165.48 ± 1.59 &#124; &#124; gpt-oss 120B MXFP4 MoE &#124; 59.02 GiB &#124; 116.83 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg512 &#124; 19.64 ± 0.06 &#124; build: 28c39da7c (6478) Benchmarks for `gpt-oss-20b` $ ./llama-cpp/build/bin/llama-bench -m models/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 1 -p 1024 -n 512 --delay 180 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon 890M Graphics (RADV GFX1150) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: KHR_coopmat &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; threads &#124; fa &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; pp1024 &#124; 430.67 ± 9.91 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 1 &#124; 1 &#124; tg512 &#124; 27.85 ± 0.08 &#124; build: 28c39da7c (6478) |

Beta Was this translation helpful? [Give feedback.](#)

3 You must be logged in to vote

👍 5

All reactions

- 👍 5

3 replies

[](/traysh)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [traysh](/traysh) [Sep 23, 2025](#discussioncomment-14488136)

-

| On Phoronix benchmarks, the performance was much higher, what could be the difference? https://www.phoronix.com/review/amd-rocm-7-strix-halo/3 |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/dispanser)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [dispanser](/dispanser) [Oct 19, 2025](#discussioncomment-14722284)

-

| @traysh : this is not strix halo (8060s) but Strix Point (890M) |

Beta Was this translation helpful? [Give feedback.](#)

👍 1

All reactions

- 👍 1

[](/Djip007)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

#### [Djip007](/Djip007) [Nov 25, 2025](#discussioncomment-15077345)

-

| with a ryzen 7940HS (ie radeon 780M) and 128Go of RAM I have better result with HIP build on pp: GGML_CUDA_ENABLE_UNIFIED_MEMORY=ON \ llama-server -ngl 999 --no-mmap -ub 2048 -b 4096 -c 0 -fa on --jinja \ -m openai_gpt-oss-120b/MXFP4.gguf (in this case with rocm-7.11 from therock, it is not stable with rocm6.4.4!): ... Device 0: AMD Radeon 780M Graphics, gfx1103 (0x1103), VMM: no, Wave Size: 32 model size params backend ngl n_ubatch fa mmap test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1 18.85 ± 0.97 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1 19.02 ± 0.35 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp2 19.03 ± 1.00 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp3 23.71 ± 1.12 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp4 27.35 ± 1.71 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp8 43.17 ± 3.46 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp12 37.32 ± 1.07 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp16 44.67 ± 1.36 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp24 32.53 ± 0.87 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp32 24.74 ± 1.56 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp48 62.17 ± 2.73 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp64 114.55 ± 2.00 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp96 126.83 ± 2.06 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp128 146.26 ± 1.97 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp192 167.32 ± 1.30 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp256 187.21 ± 0.35 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp384 205.55 ± 5.13 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp512 218.99 ± 2.46 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp768 237.52 ± 3.04 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1024 250.46 ± 1.00 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1536 254.90 ± 1.83 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp2048 258.40 ± 0.90 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp3072 247.72 ± 1.16 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp4096 244.26 ± 2.40 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 tg16 19.35 ± 0.10 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp512+tg64 101.92 ± 0.07 same config have good result on StrixHallo to: This one with stock rocm-6.4.4 from fedora43. model size params backend ngl n_ubatch fa mmap test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1 51.44 ± 0.41 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1 51.63 ± 0.25 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp2 59.82 ± 0.92 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp3 80.97 ± 2.97 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp4 102.17 ± 3.03 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp8 157.13 ± 6.53 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp12 167.46 ± 4.24 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp16 183.64 ± 11.85 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp24 222.79 ± 5.86 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp32 238.90 ± 18.10 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp48 228.93 ± 19.80 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp64 314.23 ± 3.45 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp96 395.90 ± 4.25 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp128 435.93 ± 7.71 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp192 506.93 ± 6.98 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp256 588.22 ± 6.58 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp384 707.59 ± 6.55 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp512 781.25 ± 2.85 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp768 852.62 ± 3.17 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1024 915.19 ± 1.04 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp1536 991.37 ± 1.68 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp2048 1018.35 ± 2.66 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp3072 954.44 ± 2.93 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp4096 983.83 ± 1.94 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 tg16 51.81 ± 0.02 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B ROCm 999 4096 1 0 pp512+tg64 300.97 ± 0.64 build: c97c6d965 (7123) |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [raymondlo84Fork](/raymondlo84Fork)

[Aug 19, 2025](#discussioncomment-14157438)

-

| I got this running on Intel AI PC (Intel Core Ultra 7 258V with Vulkan!). The new GPU driver now can change the GPU memory allocation and so it can easily fit all 25 layers on the VRAM (shared). llama_perf_sampler_print: sampling time = 5.94 ms / 44 runs ( 0.14 ms per token, 7406.16 tokens per second) llama_perf_context_print: load time = 17569.42 ms llama_perf_context_print: prompt eval time = 2044.57 ms / 84 tokens ( 24.34 ms per token, 41.08 tokens per second) llama_perf_context_print: eval time = 4781.04 ms / 85 runs ( 56.25 ms per token, 17.78 tokens per second) llama_perf_context_print: total time = 301066.37 ms / 169 tokens llama_perf_context_print: graphs reused = 84 Video example: https://youtu.be/C_9W19j0t_A log.txt P.S. One more thing is the documentation was kinda missing this (https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md#vulkan) so it won't compile with CURL by default: #9937 |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

👍 2

All reactions

- 👍 2

0 replies

38 hidden items Load more…

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [grigio](/grigio)

[Oct 18, 2025](#discussioncomment-14715779)

-

| AMD Ryzen 7 7700 Debian 13, Linux 6.12 ./llama-bench -m /mnt/models/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -p 512,1024 -n 512,1024 --delay 180 load_backend: loaded RPC backend from /mnt/llamacpp/bin/libggml-rpc.so ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV RAPHAEL_MENDOCINO) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 32 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: none load_backend: loaded Vulkan backend from /mnt/llamacpp/bin/libggml-vulkan.so load_backend: loaded CPU backend from /mnt/llamacpp/bin/libggml-cpu-icelake.so model size params backend ngl threads test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 pp512 42.63 ± 0.42 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 pp1024 42.56 ± 0.08 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 tg512 7.42 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 tg1024 7.34 ± 0.00 build: 8138785 (6792) With amdgpu driver ./llama-bench -m /mnt/data/models/gpt-oss-20b-mxfp4.gguf -ngl 99 -fa 1 --mmap 0 load_backend: loaded RPC backend from /mnt/llamacpp/bin/libggml-rpc.so ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV RAPHAEL_MENDOCINO) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 32 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: none load_backend: loaded Vulkan backend from /mnt/llamacpp/bin/libggml-vulkan.so load_backend: loaded CPU backend from /mnt/llamacpp/bin/libggml-cpu-icelake.so model size params backend ngl fa mmap test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 0 pp512 41.44 ± 0.35 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 0 tg128 7.67 ± 0.00 ./llama-bench -m ../../docker-ollama/data/models/gpt-oss-20b-mxfp4.gguf -ngl 99 -t 1 -fa 0,1 -p 1024 -n 512 --delay 180 load_backend: loaded RPC backend from /mnt/llamacpp/bin/libggml-rpc.so ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV RAPHAEL_MENDOCINO) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 32 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: none load_backend: loaded Vulkan backend from /mnt/llamacpp/bin/libggml-vulkan.so load_backend: loaded CPU backend from /mnt/llamacpp/bin/libggml-cpu-icelake.so model size params backend ngl threads fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 0 pp1024 42.29 ± 0.21 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 0 tg512 7.52 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 1 pp1024 40.83 ± 0.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 1 tg512 7.65 ± 0.00 build: ee09828 (6795) |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [TinyServal](/TinyServal)

[Oct 19, 2025](#discussioncomment-14720821)

-

| Radeon 660M (Ryzen 5 6600H), dual channel DDR5 4800MT/s Debian 13, kernel 6.12.48, mesa 25.0.7 AMD_VULKAN_ICD=RADV build/bin/llama-bench -m ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -ngl 99 -fa 1 -b 2048 -ub 2048 -p 1024,2048,4096,8192 --mmap 0 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV REMBRANDT) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 32 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: none model size params backend ngl n_ubatch fa mmap test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp1024 135.64 ± 0.34 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp2048 106.13 ± 0.13 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp4096 96.87 ± 0.05 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp8192 85.98 ± 0.03 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 tg128 18.69 ± 0.01 build: 6eb208d (6894) AMD_VULKAN_ICD=AMDVLK build/bin/llama-bench -m ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -ngl 99 -fa 1 -b 2048 -ub 2048 -p 1024,2048,4096,8192 --mmap 0 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (AMD open-source driver) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 32 &#124; shared memory: 32768 &#124; int dot: 1 &#124; matrix cores: none model size params backend ngl n_ubatch fa mmap test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp1024 111.64 ± 0.23 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp2048 92.48 ± 0.12 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp4096 85.61 ± 0.06 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 pp8192 73.28 ± 0.04 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 2048 1 0 tg128 15.35 ± 0.00 build: 6eb208d (6894) Older results $ build/bin/llama-bench -m ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -ngl 99 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 --mmap 0 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV REMBRANDT) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 32 &#124; shared memory: 65536 &#124; int dot: 1 &#124; matrix cores: none &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; n_ubatch &#124; fa &#124; mmap &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; -------: &#124; -: &#124; ---: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 2048 &#124; 1 &#124; 0 &#124; pp2048 &#124; 99.02 ± 0.15 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 2048 &#124; 1 &#124; 0 &#124; pp8192 &#124; 80.80 ± 0.06 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 2048 &#124; 1 &#124; 0 &#124; pp16384 &#124; 65.84 ± 0.04 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 2048 &#124; 1 &#124; 0 &#124; pp32768 &#124; 46.90 ± 0.09 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 99 &#124; 2048 &#124; 1 &#124; 0 &#124; tg128 &#124; 18.51 ± 0.00 &#124; build: ee09828c (6795) </details> |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

All reactions

4 replies

[](/grigio)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [grigio](/grigio) [Oct 19, 2025](#discussioncomment-14723235)

-

| I tried to replicate your results with the same OS and command but I get much lower t/s, did you tweak something? |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/TinyServal)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [TinyServal](/TinyServal) [Oct 20, 2025](#discussioncomment-14728041)

-

| A few things I could think of that might affect performance: UMA buffer size was set to 8GB in BIOS. On low end systems like this ideally you'd want to dedicate enough memory to the GPU instead of relying on TTM for optimal performance. I'd go for 16GB but the firmware doesn't allow it unfortunately. System power limit was set to 45W. I had the DKMS amdgpu kernel module installed because I was testing ROCm on the system, which turned out to be slightly slower. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/grigio)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [grigio](/grigio) [Oct 20, 2025](#discussioncomment-14733677)

-

| Thanks, i think it's because I miss amdgpu-dkms |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

[](/TinyServal)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [TinyServal](/TinyServal) [Nov 1, 2025](#discussioncomment-14844237)

-

| Updated the results, this time with lower prefill length since it took forever to run last time. |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [fwaris](/fwaris)

[Oct 19, 2025](#discussioncomment-14723402)

-

| The Register measured performance of llama.cpp, vlm and tensorrt on the DGX Spark. https://www.theregister.com/2025/10/14/dgx_spark_review/ llama.cpp has the highest token generation rate for gpt-oss-20b (57 tps); tensorrt has the best time-to-first-token. |

Beta Was this translation helpful? [Give feedback.](#)

4 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [ducin](/ducin)

[Oct 23, 2025](#discussioncomment-14756594)

-

| How can I pass the system prompt, e.g. when running this way? llama-server -hf ggml-org/gpt-oss-20b-GGUF --jinja? |

Beta Was this translation helpful? [Give feedback.](#)

3 You must be logged in to vote

All reactions

1 reply

[](/g0t4)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [g0t4](/g0t4) [Nov 18, 2025](#discussioncomment-15003188)

-

| you're not passing it with requests? |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [pt13762104](/pt13762104)

[Oct 23, 2025](#discussioncomment-14761475)

-

| ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 2 CUDA devices: Device 0: Tesla T4, compute capability 7.5, VMM: yes Device 1: Tesla T4, compute capability 7.5, VMM: yes build: 8cf6b42d4 (6824) (2xT4 on Kaggle, the results are a bit lower than expected due to throttling and -r 1) 1 GPU model size params backend ngl fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp2048 1129.46 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp8192 1045.21 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp16384 852.38 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp32768 783.65 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 tg128 50.76 ± 0.00 2 GPUs model size params backend ngl fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp2048 1577.49 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp8192 1664.53 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp16384 1465.46 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 pp32768 1361.89 ± 0.00 model size params backend ngl n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1 pp2048 1506.87 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1 pp8192 1727.19 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1 pp16384 1795.81 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1 pp32768 1532.06 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 512 1 tg128 57.88 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1 tg128 67.34 ± 0.00 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: Tesla P100-PCIE-16GB, compute capability 6.0, VMM: yes build: f8f071fad (6830) P100 model size params backend ngl n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp512 730.73 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp2048 1032.81 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp8192 951.69 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp16384 818.30 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp32768 638.96 ± 0.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 tg128 66.30 ± 0.00 |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

1 reply

[](/pt13762104)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [pt13762104](/pt13762104) [Oct 23, 2025](#discussioncomment-14762016)

-

| I've seen performance as high as 2200t/s on pp8192 with n_batch = 4096, n_ubatch = 2048 but couldn't replicate it. Batch size testing model size params backend ngl n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 512 1 pp2048 1709.18 ± 7.86 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 512 1 pp4096 1769.71 ± 17.13 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 512 1 pp8192 1696.18 ± 37.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 512 1 pp16384 1490.06 ± 60.74 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1024 1 pp2048 1586.05 ± 3.94 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1024 1 pp4096 1785.48 ± 15.08 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1024 1 pp8192 1748.26 ± 25.57 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 1024 1 pp16384 1777.60 ± 8.74 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 2048 1 pp2048 1534.55 ± 5.81 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 2048 1 pp4096 1742.68 ± 14.52 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 2048 1 pp8192 1813.33 ± 10.75 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 2048 1 pp16384 1760.20 ± 12.15 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 4096 1 pp2048 1560.12 ± 6.65 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 4096 1 pp4096 1773.47 ± 10.27 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 4096 1 pp8192 1810.19 ± 27.71 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1024 4096 1 pp16384 1765.50 ± 6.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 512 1 pp2048 1499.88 ± 3.62 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 512 1 pp4096 1598.59 ± 6.68 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 512 1 pp8192 1595.79 ± 10.80 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 512 1 pp16384 1529.12 ± 12.74 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 1024 1 pp2048 1569.71 ± 14.89 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 1024 1 pp4096 1769.98 ± 8.60 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 1024 1 pp8192 1809.92 ± 18.93 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 1024 1 pp16384 1761.43 ± 8.12 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp2048 1314.51 ± 4.00 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp4096 1646.38 ± 7.64 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp8192 1823.24 ± 13.14 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 2048 1 pp16384 1837.68 ± 10.35 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp2048 1340.97 ± 15.36 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp4096 1670.44 ± 8.84 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp8192 1808.76 ± 20.53 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 2048 4096 1 pp16384 1842.25 ± 8.20 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 512 1 pp2048 1502.06 ± 8.23 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 512 1 pp4096 1600.59 ± 8.11 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 512 1 pp8192 1595.80 ± 8.07 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 512 1 pp16384 1520.21 ± 10.03 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 1024 1 pp2048 1554.47 ± 9.72 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 1024 1 pp4096 1761.26 ± 13.54 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 1024 1 pp8192 1800.54 ± 22.88 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 1024 1 pp16384 1758.65 ± 9.88 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp2048 1310.38 ± 6.39 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp4096 1651.63 ± 1.31 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp8192 1821.94 ± 14.74 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 2048 1 pp16384 1826.65 ± 3.19 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp2048 1317.77 ± 2.62 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp4096 1254.06 ± 13.45 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp8192 1492.01 ± 28.07 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp16384 1645.39 ± 18.27 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 512 1 pp2048 1496.88 ± 8.90 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 512 1 pp4096 1601.08 ± 3.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 512 1 pp8192 1612.62 ± 13.03 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 512 1 pp16384 1510.03 ± 14.02 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 1024 1 pp2048 1558.03 ± 8.06 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 1024 1 pp4096 1769.98 ± 10.49 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 1024 1 pp8192 1791.57 ± 18.84 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 1024 1 pp16384 1751.54 ± 3.83 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 2048 1 pp2048 1310.08 ± 6.17 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 2048 1 pp4096 1632.67 ± 5.63 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 2048 1 pp8192 1806.60 ± 12.35 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 2048 1 pp16384 1819.54 ± 6.76 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 4096 1 pp2048 1313.15 ± 8.90 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 4096 1 pp4096 1249.32 ± 8.83 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 4096 1 pp8192 1494.32 ± 18.87 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 8192 4096 1 pp16384 1638.16 ± 13.61 |

Beta Was this translation helpful? [Give feedback.](#)

All reactions

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [julmb](/julmb)

[Oct 24, 2025](#discussioncomment-14769817)

-

| I don't know if this is the right place to ask, but I'm curious about the rationale behind the quantization of the ggml-org model. From what I understand, the original model is a mix of BF16 and MXFP4. It looks like in the quantization at ggml-org, the MXFP4 tensors were kept as-is, while some of the BF16 tensors were encoded as F32, and others were quantized to Q8_0. For the small tensors, why not keep BF16? Is BF16 slower or poorly-supported? For the medium tensors, why quantize to Q8_0? It doesn't seem to save that much space since the bulk of the weights is in the MXFP4 tensors anyways and the Q8_0 quantization could potentially affect model performance, no? |

Beta Was this translation helpful? [Give feedback.](#)

3 You must be logged in to vote

All reactions

1 reply

[](/ggerganov)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [ggerganov](/ggerganov) [Oct 24, 2025](#discussioncomment-14773571)

Maintainer Author

-

| Small tensors in ggml are currently always F32 as it does not make a significant difference. Support for other types will be implemented at some point, but it's not a huge priority atm. Q8_0 has virtually the same quality as BF16 and at the same time is widely supported by all ggml backends, which is not the case for BF16. Hence there are no benefits to keep the weights in BF16. |

Beta Was this translation helpful? [Give feedback.](#)

👍 4

All reactions

- 👍 4

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [nemu94](/nemu94)

[Oct 24, 2025](#discussioncomment-14771118)

-

| OS: Microsoft Windows 11 Pro (10.0.26100 64bit) ROCM used to build PyTorch: 6.4.50101-9a6572ae7 HIP runtime version: 6.4.50101 Name: AMD Ryzen 7 7800X3D 8-Core Processor GPU models and configuration: AMD Radeon RX 7900 GRE (gfx1100) PS C:\llamacpp\models> llama-bench -m gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 -dev ROCm0 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 2 ROCm devices: Device 0: AMD Radeon RX 7900 GRE, gfx1100 (0x1100), VMM: no, Wave Size: 32 Device 1: AMD Radeon(TM) Graphics, gfx1036 (0x1036), VMM: no, Wave Size: 32 load_backend: loaded ROCm backend from C:\llamacpp\ggml-hip.dll load_backend: loaded RPC backend from C:\llamacpp\ggml-rpc.dll load_backend: loaded CPU backend from C:\llamacpp\ggml-cpu-icelake.dll model size params backend ngl threads n_ubatch fa dev test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 1 2048 1 ROCm0 pp2048 3039.79 ± 26.49 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 1 2048 1 ROCm0 pp8192 2710.60 ± 15.36 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 1 2048 1 ROCm0 pp16384 2252.72 ± 5.21 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 1 2048 1 ROCm0 pp32768 1647.01 ± 5.82 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 1 2048 1 ROCm0 tg128 121.09 ± 1.48 build: 0bf47a1 (6829) |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [rbnhln](/rbnhln)

[Oct 24, 2025](#discussioncomment-14771850)

-

| Thank you for that useful guide. I noticed the a Benchmark for the NVIDIA RTX A2000 ADA is missing. System: QEMU VM with Alma Linux 9 AMD Ryzen 5 Pro 5655 G (8 Cores) 16 GB RAM NVidia RTX A2000 Ada Generation (direct PCI passthrough) llama-bench -m /models/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -fa 1 -b 4096 -ub 4096 -p 2048,8192,16384,32768 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA RTX 2000 Ada Generation, compute capability 8.9, VMM: yes model size params backend ngl n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp2048 2625.97 ± 3.82 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp8192 2443.16 ± 7.21 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp16384 2230.95 ± 13.62 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 pp32768 1876.70 ± 12.78 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 4096 4096 1 tg128 70.46 ± 0.14 |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [thielj](/thielj)

[Oct 27, 2025](#discussioncomment-14796629)

-

| AMD Ryzen 5 5600H with Vega 7 iGPU. The package is capped at 35W. 2x 32GB DDR4 3200MHz (generic). Kernel 6.14.0-33-generic #33~24.04.1-Ubuntu. Llama.cpp is latest built from source. With mesa-vulkan-drivers=25.0.7-0ubuntu0.24.04.2 and libvulkan1=1.3.275.0-1build1 (both from noble-updates): llama-bench -m /mnt/models/lmstudio-community/gpt-oss-20b-GGUF/gpt-oss-20b-MXFP4.gguf -ngl 100 -b 2048,1024 -ub 1024,512 -p 512,1024 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV RENOIR) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 0 &#124; matrix cores: none &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; n_batch &#124; n_ubatch &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -------: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 1024 &#124; pp512 &#124; 114.91 ± 1.24 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 1024 &#124; pp1024 &#124; 118.80 ± 0.70 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 1024 &#124; tg128 &#124; 14.05 ± 0.01 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 512 &#124; pp512 &#124; 114.36 ± 1.11 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 512 &#124; pp1024 &#124; 113.98 ± 0.42 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 512 &#124; tg128 &#124; 14.04 ± 0.00 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 1024 &#124; pp512 &#124; 114.70 ± 0.61 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 1024 &#124; pp1024 &#124; 118.14 ± 0.24 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 1024 &#124; tg128 &#124; 14.04 ± 0.01 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 512 &#124; pp512 &#124; 114.66 ± 0.97 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 512 &#124; pp1024 &#124; 113.48 ± 0.70 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 512 &#124; tg128 &#124; 14.04 ± 0.00 &#124; build: bbac6a26b (6846) With mesa-vulkan-drivers=25.2.3-1ubuntu1 (fom questing), pp is down and tg is up: llama-bench -m /mnt/models/lmstudio-community/gpt-oss-20b-GGUF/gpt-oss-20b-MXFP4.gguf -ngl 100 -b 2048,1024 -ub 1024,512 -p 512,1024 ggml_vulkan: Found 1 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV RENOIR) (radv) &#124; uma: 1 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 0 &#124; ma &#124; model &#124; size &#124; params &#124; backend &#124; ngl &#124; n_batch &#124; n_ubatch &#124; test &#124; t/s &#124; &#124; ------------------------------ &#124; ---------: &#124; ---------: &#124; ---------- &#124; --: &#124; ------: &#124; -------: &#124; --------------: &#124; -------------------: &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 1024 &#124; pp512 &#124; 111.44 ± 1.19 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 1024 &#124; pp1024 &#124; 115.15 ± 0.66 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 1024 &#124; tg128 &#124; 15.49 ± 0.02 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 512 &#124; pp512 &#124; 110.92 ± 1.08 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 512 &#124; pp1024 &#124; 110.49 ± 0.39 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 2048 &#124; 512 &#124; tg128 &#124; 15.47 ± 0.00 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 1024 &#124; pp512 &#124; 111.45 ± 1.19 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 1024 &#124; pp1024 &#124; 114.50 ± 0.23 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 1024 &#124; tg128 &#124; 15.49 ± 0.01 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 512 &#124; pp512 &#124; 111.21 ± 0.96 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 512 &#124; pp1024 &#124; 109.99 ± 0.68 &#124; &#124; gpt-oss 20B MXFP4 MoE &#124; 11.27 GiB &#124; 20.91 B &#124; Vulkan &#124; 100 &#124; 1024 &#124; 512 &#124; tg128 &#124; 15.48 ± 0.01 &#124; build: bbac6a26b (6846) |

Beta Was this translation helpful? [Give feedback.](#)

3 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [amarbler](/amarbler)

[Nov 10, 2025](#discussioncomment-14923651)

-

| I have some results for the NVIDIA GeForce RTX 4060 Laptop GPU (8GB VRAM), Intel Core i7-14700HX, and 64 GB DDR5 5200 MT/s: Benchmarks on NVIDIA GeForce RTX 4060 (8GB) for 'gpt-oss-20b' (ggml's mxfp4) llama-bench.exe --m .\gpt-oss-20b-mxfp4.gguf --n-gpu-layers 99 --n-cpu-moe 14 --prio 3 --flash-attn 1 -ub 2048 -b 2048 -t 16 --cpu-mask 0x0000FFFF --cpu-strict 1 -p 2048,4096,8192,16384 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 4060 Laptop GPU, compute capability 8.9, VMM: yes model size params backend ngl threads cpu_mask cpu_strict n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp2048 1642.09 ± 34.96 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp4096 1669.38 ± 9.87 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp8192 1635.49 ± 11.91 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp16384 1567.09 ± 6.35 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 tg128 42.32 ± 1.21 build: eeee367 (6989) Benchmarks on NVIDIA GeForce RTX 4060 (8GB) for 'gpt-oss-20b' (Unsloth's F16) llama-bench.exe --m .\gpt-oss-20b-F16.gguf --n-gpu-layers 99 --n-cpu-moe 17 --prio 3 --flash-attn 1 -ub 2048 -b 2048 -t 16 --cpu-mask 0x0000FFFF --cpu-strict 1 -p 2048,4096,8192,16384 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 4060 Laptop GPU, compute capability 8.9, VMM: yes model size params backend ngl threads cpu_mask cpu_strict n_ubatch fa test t/s gpt-oss 20B F16 12.83 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp2048 1429.64 ± 82.71 gpt-oss 20B F16 12.83 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp4096 1520.00 ± 29.97 gpt-oss 20B F16 12.83 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp8192 1517.10 ± 8.70 gpt-oss 20B F16 12.83 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 pp16384 1451.41 ± 5.97 gpt-oss 20B F16 12.83 GiB 20.91 B CUDA 99 16 0x0000FFFF 1 2048 1 tg128 32.73 ± 0.21 build: eeee367 (6989) Benchmarks on NVIDIA GeForce RTX 4060 (8GB) for 'gpt-oss-120b' (ggml's mxfp4) llama-bench.exe --m .\gpt-oss-120b-mxfp4-00001-of-00003.gguf --n-gpu-layers 99 --n-cpu-moe 34 --prio 3 --flash-attn 1 -ub 2048 -b 2048 -t 16 --cpu-mask 0x0000FFFF --cpu-strict 1 -p 2048,4096,8192,16384 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 4060 Laptop GPU, compute capability 8.9, VMM: yes model size params backend ngl threads cpu_mask cpu_strict n_ubatch fa test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp2048 333.10 ± 18.50 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp4096 354.43 ± 6.38 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp8192 357.27 ± 2.98 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp16384 356.03 ± 2.65 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 tg128 18.85 ± 2.02 build: eeee367 (6989) Benchmarks on NVIDIA GeForce RTX 4060 (8GB) for 'gpt-oss-120b' (Unsloth's F16) llama-bench.exe --m .\gpt-oss-120b-F16.gguf --n-gpu-layers 99 --n-cpu-moe 35 --prio 3 --flash-attn 1 -ub 2048 -b 2048 -t 16 --cpu-mask 0x0000FFFF --cpu-strict 1 -p 2048,4096,8192,16384 ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GeForce RTX 4060 Laptop GPU, compute capability 8.9, VMM: yes model size params backend ngl threads cpu_mask cpu_strict n_ubatch fa test t/s gpt-oss 120B F16 60.87 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp2048 201.31 ± 36.50 gpt-oss 120B F16 60.87 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp4096 250.83 ± 14.37 gpt-oss 120B F16 60.87 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp8192 316.58 ± 37.36 gpt-oss 120B F16 60.87 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 pp16384 344.61 ± 2.45 gpt-oss 120B F16 60.87 GiB 116.83 B CUDA 99 16 0x0000FFFF 1 2048 1 tg128 17.41 ± 1.27 build: eeee367 (6989) |

Beta Was this translation helpful? [Give feedback.](#)

2 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [mkukec](/mkukec)

[Nov 17, 2025](#discussioncomment-14989283)

-

| Hardware: RX 9070 XT (16 GB VRAM), Ryzen 7 7700X, 32 GB RAM OS / API / Build: Ubuntu 24.04 LTS, Vulkan, llama-b7083-bin-ubuntu-vulkan-x64 GPU behavior (rocm-smi): VRAM 90–96%, Temp 55 °C, Power 306–316 W (limit 317 W), Fan 65–70% ./llama-bench -m $HOME/work/gpt-oss-20b-GGUF/gpt-oss-20b-MXFP4.gguf -ngl 99 -t 1 -fa 1 -b 4096 -ub 2048,4096 -p 2048,8192,16384,32768 model size params backend ngl threads n_batch n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 2048 1 pp2048 2753.99 ± 3.51 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 2048 1 pp8192 2359.88 ± 4.74 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 2048 1 pp16384 1942.51 ± 1.23 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 2048 1 pp32768 1417.87 ± 0.44 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 2048 1 tg128 174.16 ± 0.42 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 4096 1 pp2048 2751.36 ± 10.86 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 4096 1 pp8192 1983.19 ± 6.55 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 4096 1 pp16384 1682.98 ± 1.15 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 4096 1 pp32768 979.71 ± 2.63 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 1 4096 4096 1 tg128 174.31 ± 0.13 |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

👍 1

All reactions

- 👍 1

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [kamali-lab](/kamali-lab)

[Nov 23, 2025](#discussioncomment-15050155)

-

| Here's GPT-OSS-20B's performance on both a single and dual AMD Instinct MI50s using -sm none,layer: root@kamal:/mnt/shared# llama-bench -m ggml-org/gpt-oss-20b-GGUF/gpt-oss-20b-mxfp4.gguf -ngl 99 -fa 1 -p 4096 -n 128 -b 4096 -ub 1536 -sm none,layer ggml_cuda_init: GGML_CUDA_FORCE_MMQ: no ggml_cuda_init: GGML_CUDA_FORCE_CUBLAS: no ggml_cuda_init: found 2 ROCm devices: Device 0: AMD Radeon Graphics, gfx906:sramecc-:xnack- (0x906), VMM: no, Wave Size: 64 Device 1: AMD Radeon Graphics, gfx906:sramecc-:xnack- (0x906), VMM: no, Wave Size: 64 build: 028f93ef9 (7129) model size params backend ngl n_batch n_ubatch sm fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 none 1 pp4096 1254.92 ± 2.33 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 none 1 tg128 120.91 ± 1.12 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 layer 1 pp4096 1753.81 ± 3.16 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 layer 1 tg128 111.01 ± 0.13 I experimented with multiple -ub sizes until I landed on 1536 as the most performant ubatch size. This is on ROCm 7, with my cards limited to 200W each using rocm-smi -d [device ID] --setpoweroverdrive 200 . So... yeah. Performs surprisingly well! |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

2 replies

[](/mkukec)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [mkukec](/mkukec) [Nov 23, 2025](#discussioncomment-15051321)

-

| Did you try Vulkan? For me, it works a bit better than ROCm. Overall, I’m also pleasantly surprised by the performance. |

Beta Was this translation helpful? [Give feedback.](#)

👍 2

All reactions

- 👍 2

[](/phoyd)

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

#### [phoyd](/phoyd) [Nov 24, 2025](#discussioncomment-15065288)

-

| Did you try Vulkan? For me, it works a bit better than ROCm. Overall, I’m also pleasantly surprised by the performance. Vulkan ist usually much slower in preprocessing (at least for Vega20 on Ubuntu 24.04.3). Here's my setup: ROCm 7 Device 0: AMD Radeon Graphics, gfx906:sramecc+:xnack- (0x906), VMM: no, Wave Size: 64 Device 1: AMD Radeon Graphics, gfx906:sramecc+:xnack- (0x906), VMM: no, Wave Size: 64 Device 2: AMD Radeon Graphics, gfx906:sramecc+:xnack- (0x906), VMM: no, Wave Size: 64 model size params backend ngl n_batch n_ubatch sm fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 none 1 pp4096 1287.48 ± 4.78 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 none 1 tg128 123.27 ± 0.04 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 layer 1 pp4096 1532.37 ± 1.90 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B ROCm 99 4096 1536 layer 1 tg128 87.87 ± 0.51 Vulkan ggml_vulkan: Found 3 Vulkan devices: ggml_vulkan: 0 = AMD Radeon Graphics (RADV VEGA20) (radv) &#124; uma: 0 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 0 &#124; matrix cores: none ggml_vulkan: 1 = AMD Radeon Graphics (RADV VEGA20) (radv) &#124; uma: 0 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 0 &#124; matrix cores: none ggml_vulkan: 2 = AMD Radeon Graphics (RADV VEGA20) (radv) &#124; uma: 0 &#124; fp16: 1 &#124; bf16: 0 &#124; warp size: 64 &#124; shared memory: 65536 &#124; int dot: 0 &#124; matrix cores: none model size params backend ngl n_batch n_ubatch sm fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 4096 1536 none 1 pp4096 530.20 ± 1.66 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 4096 1536 none 1 tg128 124.91 ± 0.18 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 4096 1536 layer 1 pp4096 526.14 ± 0.76 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B Vulkan 99 4096 1536 layer 1 tg128 65.13 ± 0.06 |

Beta Was this translation helpful? [Give feedback.](#)

👀 1

All reactions

- 👀 1

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [traysh](/traysh)

[Nov 25, 2025](#discussioncomment-15079003)

-

| Asus Ascent GX10 (same "superchip" as Nvidia DGX Spark, GB10): llama-bench -m .cache/llama.cpp/ggml-org_gpt-oss-20b-GGUF_gpt-oss-20b-mxfp4.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 gpt-oss:20b Device 0: NVIDIA GB10, compute capability 12.1, VMM: yes model size params backend ngl threads n_ubatch fa test t/s gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp2048 3729.54 ± 26.70 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp8192 3664.00 ± 4.98 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp16384 3469.56 ± 6.79 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 pp32768 3065.79 ± 7.50 gpt-oss 20B MXFP4 MoE 11.27 GiB 20.91 B CUDA 99 1 2048 1 tg128 84.18 ± 0.27 llama-bench -m .cache/llama.cpp/ggml-org_gpt-oss-120b-GGUF_gpt-oss-120b-mxfp4-00001-of-00003.gguf -t 1 -fa 1 -b 2048 -ub 2048 -p 2048,8192,16384,32768 gpt-oss:120b Device 0: NVIDIA GB10, compute capability 12.1, VMM: yes model size params backend ngl threads n_ubatch fa test t/s gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp2048 1815.60 ± 79.11 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp8192 1884.05 ± 0.93 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp16384 1816.43 ± 6.72 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 pp32768 1637.51 ± 3.82 gpt-oss 120B MXFP4 MoE 59.02 GiB 116.83 B CUDA 99 1 2048 1 tg128 57.19 ± 0.08 |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

edited

-

### Uh oh!

There was an error while loading. [Please reload this page]().

### [mingodad](/mingodad)

[Dec 2, 2025](#discussioncomment-15136920)

-

| The model on https://huggingface.co/ggml-org/gpt-oss-20b-GGUF seems to be from an old version of openai/gpt-oss-20b. When testing the openai model on https://huggingface.co/chat/models/openai/gpt-oss-20b and asking: when have you been built? I’m a language model created by OpenAI. The current generation (GPT‑4) that powers this chat was first released in March 2023 and has been updated and fine‑tuned up through the end of 2024. My training data runs up to the beginning of June 2025, so I’m built on knowledge available up to that point. But when running this ggml-org/gpt-oss-20b-GGUF locally on a mac mini m4 and asking the same question: when have you been built? I’m a GPT‑4‑based model that OpenAI released on March 14 2023. The underlying training data goes up to early 2023, and the model was trained in the months leading up to that release. If you’re asking about the ChatGPT product that ships the model to users, it went live in November 2022 and has since received updates (GPT‑3.5, GPT‑4, etc.) that keep it current. Then I asked https://huggingface.co/chat/models/openai/gpt-oss-20b: tell me a significant event from 2025? Expo 2025 – Osaka, Japan (April 13 – October 13, 2025)World Expo 2025, also known as Expo 2025 Osaka, was the most watched and talked‑about global event of 2025. ... and locally to ggml-org/gpt-oss-20b-GGUF: tell me a significant event from 2025? I’m sorry, but I can’t provide that. |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

All reactions

0 replies

Comment options

-

### Uh oh!

There was an error while loading. [Please reload this page]().

Quote reply

### [jbulger82](/jbulger82)

[Dec 12, 2025](#discussioncomment-15237661)

-

| I’ve been running gpt-oss-20b on llama.cpp hard for a while now (Linux + Vulkan/AMD in my case), and I want to share what’s been rock-solid for me: the exact llama-server launch commands, and the key detail that made tool-calling behave consistently. Why this matters If you’re testing MCP / tool calling / “agentic” workflows with an OSS model, most “it won’t call tools” problems end up being one of these: the chat template / Jinja formatting doesn’t match what the model expects the system prompt doesn’t clearly force tool usage rules the model is fine, but your tool schema / output format is inconsistent 1) Chat server (gpt-oss-20b) — my working command /home/jeff/llama-b6962-bin-ubuntu-vulkan-x64/build/bin/llama-server \ -m "/home/jeff/Desktop/models/gpt-oss-20b-Q4_K_M.gguf" \ -ngl 99 \ -c 131072 \ --parallel 1 \ --host 0.0.0.0 --port 8082 \ -b 2056 -ub 256 \ -fa auto \ --temp 1.0 --top-p 0.9 --top-k 40 \ --repeat-penalty 1.1 --repeat-last-n 200 \ --cache-type-k q8_0 --cache-type-v q8_0 \ --mlock \ --threads 8 --threads-batch 8 \ --chat-template-kwargs '{"reasoning_effort": "high"}' \ --jinja 2) Same server, but with a custom Jinja chat template file If you’re serious about tool calling, a good Jinja template makes the model way more predictable. /home/jeff/llama-b6962-bin-ubuntu-vulkan-x64/build/bin/llama-server \ -m "/home/jeff/Desktop/models/gpt-oss-20b-gpt-5-codex-distill.F16.gguf" \ -ngl 99 \ -c 131072 \ --parallel 1 \ --host 0.0.0.0 --port 8082 \ -b 2056 -ub 256 \ -fa auto \ --temp 1.0 --top-p 1.0 --top-k 40 \ --repeat-penalty 1.0 --repeat-last-n 200 \ --cache-type-k q8_0 --cache-type-v q8_0 \ --mlock \ --threads 24 --threads-batch 12 \ --chat-template-file "/home/jeff/Desktop/models/francine_oss.jinja.txt" \ --jinja I included my strict compatibility Jinja template in the repo — it’s designed to keep tool formatting consistent and to force a clean tool-call contract. https://github.com/jbulger82/LLAMA_Hub/blob/main/francine_oss.jinja.txt (Even if you don’t use my UI, the template is still useful as a reference.) 3) Separate local embedding server (keeps RAG fast + cheap) /home/jeff/build-cpu/bin/llama-server \ --embedding \ -m "/home/jeff/Desktop/models/qwen3-embedding-0.6b-q4_k_m.gguf" \ -c 8192 -b 512 \ --parallel 1 \ --host 0.0.0.0 Notes / tuning tips (what actually mattered for me) --mlock helped stability a lot under long sessions. Batch settings (-b, -ub) and ctx size (-c) are where the “feel” comes from. If you’re crashing, lower those first. If tool calling is flaky: test with a strong cloud model once to verify your tool schema/format, then come back to OSS. It saves hours. If folks want, I can also share the system prompt pattern I use with gpt-oss-20b to make tool-calling basically “click” (it’s short, but very explicit). And yeah: llama.cpp has completely changed what “consumer hardware” can do. It’s insane. (Repo with the template + related stuff is on my GitHub profile, but the commands above should be enough to reproduce the core setup.) |

Beta Was this translation helpful? [Give feedback.](#)

1 You must be logged in to vote

👍 2

All reactions

- 👍 2

0 replies

[Sign up for free](/join?source=comment-repo) **to join this conversation on GitHub**. Already have an account? [Sign in to comment](/login?return_to=https%3A%2F%2Fgithub.com%2Fggml-org%2Fllama.cpp%2Fdiscussions%2F15396)

Category

[🙌

Show and tell](/ggml-org/llama.cpp/discussions/categories/show-and-tell)

Labels

None yet

72 participants

[](/ggerganov) [](/grigio) [](/g0t4) [](/maxiedaniels) [](/fwaris) [](/ducin) [](/mingodad) [](/dstoc) [](/IgorWarzocha) [](/prusswan) [](/ceroma) [](/aldehir) [](/traysh) [](/vgrebinski) [](/allkhor) [](/ivanfioravanti) [](/gcp) [](/dispanser) [](/ericcurtin) [](/Pfu) [](/Art9681) and others
