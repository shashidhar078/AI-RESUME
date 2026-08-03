const { Groq } = require("groq-sdk")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

const groqApiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GROQ_API_KEY
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

function buildFallbackInterviewReport({ resume = "", selfDescription = "", jobDescription = "" }) {
    const combinedText = `${resume} ${selfDescription} ${jobDescription}`.toLowerCase()
    const hasReact = combinedText.includes("react")
    const hasNode = combinedText.includes("node")
    const hasSystemDesign = combinedText.includes("system design") || combinedText.includes("architecture")
    const hasBackend = combinedText.includes("backend") || combinedText.includes("api")

    const matchScore = Math.min(95, 62 + (hasReact ? 8 : 0) + (hasNode ? 6 : 0) + (hasSystemDesign ? 7 : 0) + (hasBackend ? 6 : 0))
    const title = jobDescription.trim().split(/\n|\./)[0].slice(0, 80) || "Target Role"

    return {
        matchScore,
        technicalQuestions: [
            {
                question: hasReact ? "How would you structure a scalable React application for a growing product team?" : "How would you approach a complex feature implementation in a modern web application?",
                intention: "Assess technical depth and architecture thinking.",
                answer: "Explain your approach to component design, state management, testing, and performance considerations."
            },
            {
                question: hasNode ? "How would you build and scale a backend API for high traffic?" : "How would you debug a production issue in a distributed system?",
                intention: "Understand system design and troubleshooting ability.",
                answer: "Discuss observability, structured logs, monitoring, root cause analysis, and mitigation steps."
            },
            {
                question: hasSystemDesign ? "How would you design a scalable system for a growing user base?" : "How would you optimize an application for performance and reliability?",
                intention: "Evaluate system design and tradeoff thinking.",
                answer: "Cover scalability, bottlenecks, caching, load balancing, and operational best practices."
            }
        ],
        behavioralQuestions: [
            {
                question: "Tell me about a time you had to work through ambiguity on a project.",
                intention: "Evaluate ownership, communication, and adaptability.",
                answer: "Describe the situation, your reasoning, the tradeoffs, and the outcome."
            },
            {
                question: "Describe a situation where you had to learn a new technology quickly.",
                intention: "Assess learning agility and initiative.",
                answer: "Explain how you ramped up, what resources you used, and how you applied the new skill."
            }
        ],
        skillGaps: [
            {
                skill: hasSystemDesign ? "System design communication" : "Architecture reasoning",
                severity: hasSystemDesign ? "medium" : "low"
            },
            {
                skill: "Production debugging",
                severity: "medium"
            },
            {
                skill: "Communication of tradeoffs",
                severity: "low"
            }
        ],
        preparationPlan: [
            {
                day: 1,
                focus: "Role alignment and fundamentals",
                tasks: ["Review the job description carefully", "Map your experience to the required skills", "Write 3 STAR stories for behavioral questions"]
            },
            {
                day: 2,
                focus: "Technical depth",
                tasks: ["Practice one coding problem daily", "Refresh key architecture concepts", "Prepare concise examples for your strongest projects"]
            },
            {
                day: 3,
                focus: "Interview readiness",
                tasks: ["Do a mock interview", "Refine your answers for clarity and brevity", "Prepare questions for the interviewer"]
            }
        ],
        title
    }
}

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

    if (!groq) {
        throw new Error("Groq API key is not set. Please add it to the .env file.")
    }

    const prompt = `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}
`

    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            messages: [
                {
                    role: "system",
                    content: "You generate structured interview reports in strict JSON matching the provided schema."
                },
                {
                    role: "user",
                    content: `${prompt}\n\nReturn valid JSON only.`
                }
            ],
            response_format: { type: "json_object" }
        })

        const text = response.choices?.[0]?.message?.content || "{}"
        return JSON.parse(text)
    } catch (error) {
        console.warn("Groq report generation failed, using fallback report.", error?.message || error)
        return buildFallbackInterviewReport({ resume, selfDescription, jobDescription })
    }


}



async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    if (!groq) {
        throw new Error("Groq API key is not set. Please add it to the .env file.")
    }

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        messages: [
            {
                role: "system",
                content: "You generate resume HTML in strict JSON."
            },
            {
                role: "user",
                content: `${prompt}\n\nReturn valid JSON only.`
            }
        ],
        response_format: { type: "json_object" }
    })

    const text = response.choices?.[0]?.message?.content || "{}"
    const jsonContent = JSON.parse(text)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf }