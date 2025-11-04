/**
 * Fake Data Streamer - Simulates streaming data for testing
 * Useful for UI testing and development without backend
 */

export interface StreamChunk {
  type: "metadata" | "markdown" | "complete" | "error";
  data: string;
  timestamp: number;
}

/**
 * HTML Resume Example - Used as sample data
 */
export const SAMPLE_RESUME_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>John Doe - Software Engineer</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 20px; }
    .contact { margin-bottom: 20px; }
    .section { margin-bottom: 20px; }
    .job { margin-bottom: 15px; padding-left: 20px; }
    .job-title { font-weight: bold; color: #333; }
    .company { color: #666; font-style: italic; }
    .date { color: #999; font-size: 0.9em; }
    ul { margin: 10px 0; }
    li { margin: 5px 0; }
    .skills { display: flex; flex-wrap: wrap; gap: 10px; }
    .skill { background: #e9ecef; padding: 5px 10px; border-radius: 5px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>John Doe</h1>
  
  <div class="contact">
    <p>📧 john.doe@email.com | 📞 (555) 123-4567 | 🔗 linkedin.com/in/johndoe | 💻 github.com/johndoe</p>
  </div>

  <div class="section">
    <h2>Professional Summary</h2>
    <p>Full-stack software engineer with 8+ years of experience building scalable web applications. Specialized in TypeScript, React, Node.js, and cloud architecture. Passionate about clean code and mentoring junior developers.</p>
  </div>

  <div class="section">
    <h2>Experience</h2>
    
    <div class="job">
      <div class="job-title">Senior Software Engineer</div>
      <div class="company">Tech Corp | San Francisco, CA</div>
      <div class="date">January 2022 - Present</div>
      <ul>
        <li>Led development of microservices architecture handling 1M+ daily requests</li>
        <li>Reduced API response time by 40% through optimization and caching strategies</li>
        <li>Mentored 5+ junior developers and conducted code reviews</li>
        <li>Implemented CI/CD pipelines improving deployment frequency by 3x</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-title">Software Engineer</div>
      <div class="company">Web Solutions Inc. | San Francisco, CA</div>
      <div class="date">June 2019 - December 2021</div>
      <ul>
        <li>Built and maintained React-based dashboard serving 50K+ users</li>
        <li>Developed RESTful APIs using Node.js and Express</li>
        <li>Collaborated with product and design teams to deliver features on schedule</li>
        <li>Improved test coverage from 45% to 85% using Jest and React Testing Library</li>
      </ul>
    </div>

    <div class="job">
      <div class="job-title">Junior Developer</div>
      <div class="company">StartupHub | San Francisco, CA</div>
      <div class="date">July 2017 - May 2019</div>
      <ul>
        <li>Developed full-stack features in JavaScript and Python</li>
        <li>Participated in agile development with 2-week sprints</li>
        <li>Fixed bugs and optimized database queries</li>
      </ul>
    </div>
  </div>

  <div class="section">
    <h2>Technical Skills</h2>
    <div class="skills">
      <div class="skill">JavaScript/TypeScript</div>
      <div class="skill">React</div>
      <div class="skill">Node.js</div>
      <div class="skill">Express</div>
      <div class="skill">PostgreSQL</div>
      <div class="skill">MongoDB</div>
      <div class="skill">Docker</div>
      <div class="skill">AWS</div>
      <div class="skill">Git</div>
      <div class="skill">GraphQL</div>
      <div class="skill">REST APIs</div>
      <div class="skill">HTML/CSS</div>
    </div>
  </div>

  <div class="section">
    <h2>Education</h2>
    <div class="job">
      <div class="job-title">Bachelor of Science in Computer Science</div>
      <div class="company">University of California, Berkeley</div>
      <div class="date">Graduated: May 2017</div>
      <p>GPA: 3.8/4.0 | Dean's List 2016-2017</p>
    </div>
  </div>

  <div class="section">
    <h2>Certifications</h2>
    <ul>
      <li>AWS Certified Solutions Architect - Professional (2022)</li>
      <li>Kubernetes Application Developer (CKAD) (2021)</li>
    </ul>
  </div>
</body>
</html>
`;

/**
 * Simulates streaming markdown content
 */
export const SAMPLE_RESUME_MARKDOWN = `# John Doe

## Main Idea

A passionate exploration of recent discoveries and missions in space, highlighting humanity's quest to understand the cosmos and our place within it.

## Key Points

- Overview of the latest space missions, including Mars rover updates and new satellite launches.
- Discussion of groundbreaking astronomical discoveries, such as exoplanet detection and black hole imaging.
- Insights into international collaboration between agencies like NASA, ESA, and private companies.
- Reflections on the technological advancements driving space exploration.
- Consideration of the philosophical and practical implications of expanding human presence beyond Earth.

## Exploration and Innovation

Space exploration continues to push the boundaries of technology and human ingenuity. From autonomous rovers traversing Martian landscapes to telescopes peering into distant galaxies, each mission brings new challenges and opportunities for scientific advancement. The integration of artificial intelligence and robotics has accelerated data collection and analysis, enabling researchers to make discoveries at an unprecedented pace.

## Humanity's Future Among the Stars

As nations and private enterprises invest in lunar bases and Mars colonization, the dream of becoming a multi-planetary species edges closer to reality. These efforts not only expand our scientific knowledge but also inspire global cooperation and a shared vision for the future. The journey into space prompts us to reflect on our responsibilities as stewards of Earth and the ethical considerations of exploring new worlds.
`;

/**
 * Simulates an AI summary
 */
export const SAMPLE_RESUME_SUMMARY = `John Doe is an experienced full-stack software engineer with 8+ years specializing in TypeScript, React, and Node.js. Currently Senior Software Engineer at Tech Corp, he has led microservices architecture improvements resulting in 40% API response time reduction. Holds AWS Solutions Architect and Kubernetes certifications with proven track record in mentoring and DevOps optimization. Education from UC Berkeley with 3.8 GPA.`;

/**
 * Fake Data Streamer Class
 * Simulates streaming data chunks over time
 */
export class FakeDataStreamer {
  private abortController: AbortController | null = null;

  /**
   * Stream metadata about the resume
   */
  async *streamMetadata(): AsyncGenerator<StreamChunk, void, unknown> {
    const metadata = {
      title: "John Doe - Software Engineer",
      description:
        "Full-stack software engineer with 8+ years of experience in TypeScript, React, and cloud architecture",
      author: "John Doe",
      url: "https://johndoe.dev",
      image: "https://via.placeholder.com/400x300?text=John+Doe",
    };

    // Simulate streaming metadata chunks
    for (const [key, value] of Object.entries(metadata)) {
      yield {
        type: "metadata",
        data: `${key}: ${value}`,
        timestamp: Date.now(),
      };
      await this.delay(200);
    }
  }

  /**
   * Stream markdown content character by character (simulates typing)
   */
  async *streamMarkdown(): AsyncGenerator<StreamChunk, void, unknown> {
    const words = SAMPLE_RESUME_MARKDOWN.split(" ");
    let buffer = "";

    for (const word of words) {
      buffer += word + " ";

      // Emit every 5 words for better performance
      if (buffer.split(" ").length % 5 === 0) {
        yield {
          type: "markdown",
          data: buffer,
          timestamp: Date.now(),
        };
        buffer = "";
        await this.delay(100); // Adjust delay for streaming speed
      }
    }

    // Emit remaining content
    if (buffer.trim()) {
      yield {
        type: "markdown",
        data: buffer,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Stream AI summary character by character
   */
  async *streamSummary(): AsyncGenerator<StreamChunk, void, unknown> {
    const words = SAMPLE_RESUME_SUMMARY.split(" ");

    for (const word of words) {
      yield {
        type: "markdown",
        data: word + " ",
        timestamp: Date.now(),
      };
      await this.delay(50);
    }
  }

  /**
   * Stream complete resume flow: metadata -> markdown -> summary -> complete
   */
  async *streamComplete(): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      // Stream metadata
      for await (const chunk of this.streamMetadata()) {
        yield chunk;
      }

      await this.delay(300);

      // Stream markdown
      for await (const chunk of this.streamMarkdown()) {
        yield chunk;
      }

      await this.delay(300);

      // Stream summary
      for await (const chunk of this.streamSummary()) {
        yield chunk;
      }

      // Final completion
      yield {
        type: "complete",
        data: "Resume processing complete",
        timestamp: Date.now(),
      };
    } catch (error) {
      yield {
        type: "error",
        data: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Consume stream and call callback for each chunk
   */
  async consumeStream(
    generator: AsyncGenerator<StreamChunk, void, unknown>,
    callback: (chunk: StreamChunk) => void
  ): Promise<void> {
    this.abortController = new AbortController();

    try {
      for await (const chunk of generator) {
        if (this.abortController.signal.aborted) {
          break;
        }
        callback(chunk);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== "Generator cancelled") {
        console.error("Stream error:", error);
      }
    }
  }

  /**
   * Abort ongoing stream
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Helper function to get the complete HTML resume
 */
export function getResumePage(): string {
  return SAMPLE_RESUME_HTML;
}

/**
 * Helper function to get resume markdown
 */
export function getResumeMarkdown(): string {
  return SAMPLE_RESUME_MARKDOWN;
}

/**
 * Helper function to get resume summary
 */
export function getResumeSummary(): string {
  return SAMPLE_RESUME_SUMMARY;
}
