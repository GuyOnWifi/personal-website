import Hero from "@/components/Hero";
import Navigation from "@/components/Navigation";
import ExperienceList from "@/components/ExperienceList";
import Footer from "@/components/Footer";

export default function Home() {
  const buildingItems = [
    {
      title: "Full-stack and AI/ML Intern",
      company: "Nokia",
      description: "architected an autonomous 5G orchestration system using multi-agent LLMs; cut token costs by 66% and web load times by 50%.",
      icon: "/nokia.svg",
      link: "https://nokia.com",
      type: "job" as const
    },
    {
      title: "President & Full Stack Developer",
      company: "EurekaHacks",
      description: "built application portal for Canada's largest high school hackathon serving 400+ applicants; reduced no-show rate by 76%.",
      icon: "/eurekahacks.svg",
      link: "https://eurekahacks.ca",
      type: "job" as const
    },
    {
      title: "Technical Lead",
      company: "Factful",
      description: "led team of 5 to develop LLM powered fact checking tool; scaled to 20k+ visits; improved search precision by 25%.",
      icon: "/factful.png",
      link: "https://factful.io",
      type: "job" as const
    },
  ];

  const previousItems = [
    {
      title: "Phys.io (3rd @ HackTheRidge)",
      company: "GitHub",
      description: "real-time physiotherapy monitoring tool using computer vision for exercise accuracy.",
      link: "https://github.com/GuyOnWifi/physio-game",
      type: "job" as const
    },
    {
      title: "Neural Network From Scratch",
      company: "GitHub",
      description: "computer vision model for MNIST (98% accuracy) with 1000x speedup via vectorization.",
      link: "https://github.com/GuyOnWifi/neural-net",
      type: "job" as const
    },
    {
      title: "Abbey Park High School",
      company: "uwaterloo",
      description: "99% average; deca icdc qualifier; uwaterloo ccc junior perfect score.",
      link: "https://uwaterloo.ca",
      type: "job" as const
    },
  ];

  return (
    <main className="w-full h-full max-w-2xl mx-auto px-4 mb-24">
      <Navigation />

      <div className="py-12">
        <Hero />
      </div>

      <ExperienceList
        sectionTitle="what i've been building:"
        items={buildingItems}
      />

      <ExperienceList
        sectionTitle="previously & projects:"
        items={previousItems}
      />

      <Footer />
    </main>
  );
}
