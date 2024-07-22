import { Box, Link,  Spinner,  Wizard } from '@cloudscape-design/components';
import React, { useEffect, useState, useRef } from 'react';

import { readHistory } from '../apis/history';
import { subscribe } from "../apis/graphql";
import { useParams } from "react-router-dom";

import TranscribeComponent from './shortify/TranscribeComponent';
import InProgressComponent from './shortify/InProgressComponent';
import HighlightComponent from './shortify/HighlightComponent';
import ShortifyComponent from './shortify/ShortifyComponent';

interface VideoShortifyProps {
  // Define any props the component expects here
}

const VideoShortify: React.FC<VideoShortifyProps> = () => {

  const { id } = useParams();
  const [ stage, setStage ] = useState(-1);
  const [ selectedTab, setSelectedTab ] = useState(0);
  const [ highlightTitle, setHighlightTitle ] = useState("")
  const [ isLoadingNextStep, setIsLoadingNextStep ] = useState(false);
  const childRef = useRef<{ submit: () => void }>(null);


  const [
    activeStepIndex,
    setActiveStepIndex
  ] = useState(0);


  useEffect(() => {
    console.log("subscribe", id!)
    readHistory(id!).then((history) => {
      setStage(history!.stage);
    })
    const sub = subscribe(id!).subscribe({
      next: (event) => {
        console.log(event);
        setStage(event.stage);
      },
      error: (err) => {
        console.log("Error", err);
      }
    })

    return () => {
      sub.unsubscribe();
    }
  }, []);

  const onTabChangeHandler = (tab: number, title:string) => {
    setSelectedTab(tab);
    setHighlightTitle(title);
  }

  const onSubmitHandler = () => {
    if(childRef.current){
      setIsLoadingNextStep(true);
      childRef.current.submit();
    }
  }

  if(stage === -1)
    return <Box textAlign='center'><Spinner size='large'/></Box>

  
  return (
    <>
    <Wizard
      i18nStrings={{
        stepNumberLabel: stepNumber =>
          `Step ${stepNumber}`,
        collapsedStepsLabel: (stepNumber, stepsCount) =>
          `Step ${stepNumber} of ${stepsCount}`,
        skipToButtonLabel: (step) =>
          `Skip to ${step.title}`,
        navigationAriaLabel: "Steps",
        previousButton: "Previous",
        nextButton: "Next",
        submitButton: "Shortify",
        optional: "optional"
      }}
      onNavigate={({ detail }) => {
        setActiveStepIndex(detail.requestedStepIndex)
      }}
      activeStepIndex={activeStepIndex}
      isLoadingNextStep={isLoadingNextStep}
      onSubmit={onSubmitHandler}
      steps={[
        {
          title: "Transcribe video",
          info: <Link variant="info">Info</Link>,
          description:
            "It converts the audio of the video into text. This process may take about 5 minutes.",
          content: (
            stage > 0 ?
            <TranscribeComponent id={id!}/>
            : <InProgressComponent />
          )
        },
        {
          title: "Generate highlights",
          content: (
            stage > 1 ?
            <HighlightComponent id={id!} onTabChange={onTabChangeHandler}/>
            : <InProgressComponent />
          ),
        },
        {
          title: "Shortify highlight",
          content: (
            stage > 2 ?
            <ShortifyComponent id={id!} tab={selectedTab} title={highlightTitle} ref={childRef}/>
            : <InProgressComponent />
          ),
        }
      ]}

    />
    </>
  );
};

export default VideoShortify;
