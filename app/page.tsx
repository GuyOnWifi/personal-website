import Hero from "@/components/Hero";
import ExperienceList from "@/components/ExperienceList";

export default function Home() {
  const currentItems = [
    {
      title: "CS @",
      company: "Waterloo",
      icon: "/waterloo.svg",
      link: "https://uwaterloo.ca",
      type: "job" as const,
    },
  ];

  const buildingItems = [
    {
      title: "Full-stack and AI/ML Intern",
      company: "Nokia",
      description: "multi-agent LLMs to automate 5G network management.",
      icon: "/nokia.svg",
      link: "https://nokia.com",
      type: "job" as const,
    },
    {
      title: "President & Full Stack Developer",
      company: "EurekaHacks",
      description:
        "built application portal for Canada's largest high school hackathon serving 400+ applicants.",
      icon: "/eurekahacks-logo.webp",
      link: "https://eurekahacks.ca",
      type: "job" as const,
    },
  ];

  const previousItems = [
    {
      title: "named",
      company: "Schulich Leader",
      icon: "/schulich.svg",
      link: "https://schulichleaders.com/nominees/?sq=Eason+Huang#students",
      description: <>for computer engineering at uoft</>,
      type: "job" as const,
    },
    {
      title: "Technical Lead",
      company: "Factful",
      description:
        "developed LLM powered fact checking tool; scaled to 20k+ visits; declined $150k to continue high school; finalist a16z",
      icon: "/factful.png",
      link: "https://factful.io",
      type: "job" as const,
    },
    {
      title: "Top 100 worldwide in",
      company: "picoCTF 2025",
      description: "started my love for arch linux",
      icon: "/picoctf.svg",
      link: "https://picoctf.org",
      type: "job" as const,
    },
    {
      title: "Neural Network From Scratch",
      company: "GitHub",
      description:
        "computer vision model for MNIST (98% accuracy) with 1000x speedup via vectorization.",
      link: "https://github.com/GuyOnWifi/neural-net",
      type: "job" as const,
    },
  ];

  return (
    <div className="py-8 pb-16">
      <h1 className="sr-only">eason huang, software engineer</h1>
      <Hero />

      <div className="mt-8">
        <ExperienceList sectionTitle="currently:" items={currentItems} />

        <ExperienceList sectionTitle="recently:" items={buildingItems} />

        <ExperienceList
          sectionTitle="previously & projects:"
          items={previousItems}
        />
      </div>
    </div>
  );
}
