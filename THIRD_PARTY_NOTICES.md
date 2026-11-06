# Third-party notices

## Recordly

SuperShare is a modified version of [Recordly](https://github.com/webadderallorg/Recordly), Copyright (C) 2026 webadderall, licensed under the GNU AGPL v3 with the additional terms in [LICENSE.md](LICENSE.md). Recordly itself started as a fork of [OpenScreen](https://github.com/siddharthvaddem/openscreen) by Siddharth Vaddem. SuperShare is not affiliated with or endorsed by Recordly.

## Voom

The share service (Recordly Share, in `services/recordly-share`) includes code adapted from the Voom project:

- Project: [Voom](https://github.com/aritropaul/voom)
- Adapted component: `services/recordly-share/worker`
- License: MIT
- Copyright © 2026 Aritro Paul
- Upstream reference: `c1c0350ed610b0c9bc4a307fcc6a01aab0f926f9`

Recordly changes include product branding, desktop publishing integration,
authenticated commenting, local-development configuration, and viewer styling.

The Voom software is provided under the following license:

> MIT License
>
> Copyright (c) 2026 Aritro Paul
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Solar Icons

Solar Icon Set by 480 Design, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Source: https://github.com/480-Design/Solar-Icon-Set. Icons are rendered using the MIT-licensed `@solar-icons/react` package. The muted microphone adds a diagonal stroke.

## DM Sans

Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts).

DM Sans is licensed under the SIL Open Font License, Version 1.1. The unmodified regular and italic variable fonts are sourced from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/dmsans). The full license is included in [src/assets/fonts/dm-sans/OFL.txt](src/assets/fonts/dm-sans/OFL.txt).

## Clarity filler detector

Remove fillers uses the Clarity filler detector Core ML model (FillerDetector v3.1.0), bundled compiled in `electron/native/bin/filler-detector`.

- Source: [ark-tech/filler-detector-coreml](https://huggingface.co/ark-tech/filler-detector-coreml)
- License: MIT, Copyright (c) 2026 arkaydeus. The full text is in [electron/native/bin/filler-detector/LICENSE](electron/native/bin/filler-detector/LICENSE).
- The model's embedded metadata says "Proprietary"; its publisher releases it under MIT on the source page above.

The model was trained on, and its publisher credits:

- the AMI Meeting Corpus, © the AMI Consortium and the University of Edinburgh, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([corpus](https://groups.inf.ed.ac.uk/ami/corpus/));
- the ICSI Meeting Corpus, © the International Computer Science Institute, Berkeley, distributed by the University of Edinburgh, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([corpus](https://groups.inf.ed.ac.uk/ami/icsi/));
- simulated room responses from [OpenSLR SLR28](https://www.openslr.org/28/) (Ko, Peddinti, Povey, Seltzer and Khudanpur, ICASSP 2017), Apache License 2.0.

The audio and annotations were cut, relabelled and augmented for training by the model's publisher. No corpus audio is included in SuperShare.

## RNNoise

Filter noise runs FFmpeg's `arnndn` filter with `std.rnnn` (in `electron/native/bin/rnnoise`), the model originally bundled with [Xiph RNNoise](https://github.com/xiph/rnnoise), as distributed in [richardpl/arnndn-models](https://github.com/richardpl/arnndn-models).

> Copyright (c) 2007-2017, 2024 Jean-Marc Valin
> Copyright (c) 2023 Amazon
> Copyright (c) 2017, Mozilla
> Copyright (c) 2005-2017, Xiph.Org Foundation
> Copyright (c) 2003-2004, Mark Borgerding
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions
> are met:
>
> - Redistributions of source code must retain the above copyright
> notice, this list of conditions and the following disclaimer.
>
> - Redistributions in binary form must reproduce the above copyright
> notice, this list of conditions and the following disclaimer in the
> documentation and/or other materials provided with the distribution.
>
> - Neither the name of the Xiph.Org Foundation nor the names of its
> contributors may be used to endorse or promote products derived from
> this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
> ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
> LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
> A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION
> OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
> SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
> LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
> DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
> THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
> (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
> OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## whisper.cpp

Captions and the filler cross-check use [whisper.cpp](https://github.com/ggml-org/whisper.cpp), MIT License, Copyright (c) 2023-2026 The ggml authors, running OpenAI's [Whisper](https://github.com/openai/whisper) models (MIT License, Copyright (c) 2022 OpenAI).

## FFmpeg

Audio and video processing uses [FFmpeg](https://ffmpeg.org) binaries provided by the [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) package. FFmpeg is licensed under the LGPL v2.1 or later, or the GPL v2 or later for builds with GPL parts enabled; see `node_modules/ffmpeg-static/ffmpeg.LICENSE` after installing. ffmpeg-static itself is GPL v3.

## Inter Display

The share page uses Inter Display Medium (`public/fonts`, `services/recordly-share/worker/web/public/fonts`).

Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter). Licensed under the [SIL Open Font License, Version 1.1](https://openfontlicense.org).
