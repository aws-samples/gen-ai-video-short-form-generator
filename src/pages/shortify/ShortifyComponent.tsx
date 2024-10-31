import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Button,
  Container,
  Flashbar,
  Header,
  Input,
  Table,
  SpaceBetween,
  Alert,
  SegmentedControl,
} from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player';
import { animated, useSpring } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';
import { downloadData, getUrl, uploadData } from 'aws-amplify/storage';
import { updateHighlight } from '../../apis/highlight';
import { generateShort } from '../../apis/graphql';

import './ShortifyComponent.css';

interface ShortifyComponentProps {
  id: string;
  tab: number;
  title: string;
}


interface Subtitle {
  index: number;
  timestring: string;
  text: string;
}

interface Dimensions {
  width: number;
  height: number;
}

interface CoordinateAndDimensions extends Dimensions {
  x: number;
  y: number;
};

interface PlayerSection {
  start: number;
  end: number;
  section: CoordinateAndDimensions;
}

interface SectionInput {
  CropHeight: string | null;
  CropWidth: string | null;
  Xoffset: string | null;
  Yoffset: string | null;
  SectionDuration: string | null;
  Vertical: boolean | null;
};

type AspectRatio = '1:1' | '9:12';


const ShortifyComponent =  forwardRef((props: ShortifyComponentProps, ref) => {

  const navigate = useNavigate();
  const playerRef = useRef<any>(null);
  const [played, setPlayed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');

  const [{x, y, width, height}, api] = useSpring(() => ({ 
    x: 0, 
    y: 0, 
    width: 100,
    height: 100,
    immediate: true // Make initial setup immediate
  }));
  
  const [ sections, setSections ] = useState<PlayerSection[]>([{start:0, end:1, section:{x:x.get(), y:y.get(), width:width.get(), height:height.get()}}]);
  const [ curSection, setCurSection ] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 50, height: 0 });

  const dragEl = useRef<HTMLDivElement | null>(null);
  
  const [ videoUrl, setVideoUrl ] = useState("");
  const [ fetchErr, setFetchErr ] = useState(false);
  const [ title, setTitle ] = useState("");
  const [ subtitles, setSubtitles ] = useState<Subtitle[]>([]);

  useEffect(() => {
    setTitle(props.title);

    getUrl({
      path: `videos/${props.id}/FHD/${props.tab}-FHD.mp4`,
      options: {
        validateObjectExistence: false,
        useAccelerateEndpoint: true 
      },
    })
    .then((file) => setVideoUrl(file.url.toString()))
    .catch(() => setFetchErr(true));

    downloadData({
      path: `videos/${props.id}/ShortsTranscript/${props.tab}-TranscriptShorts.vtt`,
      options: {
        useAccelerateEndpoint: true
      },
    }).result
    .then((data) => data.body.text())
    .then((text) => {
      const vttfile = text.split("\n").slice(2);
      const subtitleLength = vttfile.push("");
      const subtitles: Subtitle[] = [];

      for(var i=0;i<subtitleLength/4; i++){

        
        subtitles.push({
          index: Number(vttfile[i*4]),
          timestring: vttfile[i*4+1],
          text: vttfile[i*4+2],
        })
      }

      setSubtitles(subtitles);

    })
    .catch(() => setFetchErr(true));
  }, [])

  useEffect(() => {
    const observeResize = new ResizeObserver(entries => {
      entries.forEach(entry => {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      });
    });

    if(progressRef.current)
      observeResize.observe(progressRef.current);

    return () => {
      if(progressRef.current)
        observeResize.unobserve(progressRef.current);
    };
  }, [progressRef.current]);

  useEffect(() => {

    var newSection = curSection;

    while(sections[newSection].end < played && newSection < sections.length-1){
      newSection = newSection + 1;
    }

    while(sections[newSection].start > played && newSection > 0){
      newSection = newSection - 1;
    }

    setCurSection(newSection);

  }, [played])

  useEffect(() => {
    handleReset();
  }, [aspectRatio])

  useImperativeHandle(ref, () => ({
    submit() {
      
      updateHighlight(props.id, props.tab.toString(), title);

      uploadData({
        path: `videos/${props.id}/ShortsTranscript/${props.tab}-TranscriptShorts.vtt`,
        data: subtitlesToVtt(),
        options: {
          useAccelerateEndpoint: true
        }
      })

      const converted = convertSections();
      generateShort(converted, props.id, props.tab, title)
      .then(() => navigate(`/shorts/${props.id}/${props.tab}`));
    }
  }));

  const subtitlesToVtt = () => {
    let vtt = "WEBVTT";

    subtitles.forEach((subtitle) => {
      vtt += `\n\n${subtitle.index}\n${subtitle.timestring}\n${subtitle.text}`;
    });

    return vtt;
  }

  const convertSections = () => {
    if(!containerRef.current){return "{}";}
      
    const inputs:SectionInput[] = [];
  
    sections.forEach((playerSection) => {
      const {start, end, section} = playerSection;
      const {x, y, height} = section;
  
      var xOffset = Math.floor(x/containerRef.current!.clientWidth*1920);
      xOffset % 2 !== 0 ? xOffset-- : xOffset;
  
      var yOffset = Math.floor(y/containerRef.current!.clientHeight*1080);
      yOffset % 2 !== 0 ? yOffset-- : yOffset;
  
      var croppedHeight = Math.floor(height/containerRef.current!.clientHeight*1080);
      croppedHeight % 2 !== 0 ? croppedHeight-- : croppedHeight;
      
      // Update width calculation based on aspect ratio
      var croppedWidth = aspectRatio === '1:1' 
        ? croppedHeight 
        : Math.floor(croppedHeight * 9/12);
      croppedWidth % 2 !== 0 ? croppedWidth-- : croppedWidth;
  
      const length = (end-start) * playerRef.current.getDuration();
  
      inputs.push({
        CropHeight: croppedHeight.toString(),
        CropWidth: croppedWidth.toString(),
        Xoffset: xOffset.toString(),
        Yoffset: yOffset.toString(),
        SectionDuration: length.toString(),
        Vertical: aspectRatio === '1:1' ? false : true
      })
    });
    
    return JSON.stringify(inputs);
  };

  const calculateDimensions = (baseWidth: number): { width: number; height: number } => {
    if (aspectRatio === '1:1') {
      return { width: baseWidth, height: baseWidth };
    } else {
      // 9:12 ratio - if baseWidth is 100, height will be 177.78
      return { width: baseWidth * 0.75, height: baseWidth };
    }
  };

  const bind = useDrag((state) => {
    const isResizing = (state?.event.target === dragEl.current);
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const containerHeight = containerRef.current?.clientHeight ?? 0;

    if (isResizing) {
      const newWidth = state.offset[1];
      const dimensions = calculateDimensions(newWidth);
      
      // Ensure the new dimensions don't exceed container bounds
      if (dimensions.height + y.get() <= containerHeight && 
          dimensions.width + x.get() <= containerWidth) {
        api.set({
          width: dimensions.width,
          height: dimensions.height,
        });

        const newSections = [...sections];
        const curSec = newSections[curSection];
        curSec.section.width = dimensions.width;
        curSec.section.height = dimensions.height;
        setSections(newSections);
      }
    } else {
      api.set({
        x: state.offset[0],
        y: state.offset[1],
      });

      const newSections = [...sections];
      const curSec = newSections[curSection];
      curSec.section.x = state.offset[0];
      curSec.section.y = state.offset[1];
      setSections(newSections);
    }
  }, {
    from: (event) => {
      const isResizing = (event.target === dragEl.current);
      if (isResizing) {
        return [width.get(), height.get()];
      } else {
        return [x.get(), y.get()];
      }
    },
    bounds: (state) => {
      const isResizing = (state?.event.target === dragEl.current);
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const containerHeight = containerRef.current?.clientHeight ?? 0;
      if (isResizing) {
        return {
          top: 50,
          left: 50,
          right: containerWidth - x.get(),
          bottom: containerHeight - y.get(),
        };
      } else {
        return {
          top: 0,
          left: 0,
          right: containerWidth - width.get(),
          bottom: containerHeight - height.get(),
        };
      }
    },
  });

  const handleReset = () => {
    setPlayed(0);
    const baseWidth = 100;
    const newHeight = aspectRatio === '1:1' 
      ? baseWidth 
      : (baseWidth * 12) / 9;
    
    api.start({
      to: {
        x: 0,
        y: 0,
        width: baseWidth,
        height: newHeight
      },
      immediate: true  // Make reset immediate too
    });
    
    setSections([{
      start: 0, 
      end: 1, 
      section: {
        x: 0,
        y: 0,
        width: baseWidth,
        height: newHeight
      }
    }]);
    setCurSection(0);
  };

  const handleAspectRatioChange = ({ detail }: { detail: { selectedId: string } }) => {    
    const newAspectRatio = detail.selectedId as AspectRatio;
    
    // // Calculate new dimensions
    // const currentWidth = width.get();
    // const newHeight = newAspectRatio === '1:1' 
    //   ? currentWidth 
    //   : (currentWidth * 12) / 9;
  
    // Update all state synchronously
    setAspectRatio(newAspectRatio);
    
    // // Update spring with immediate flag
    // api.start({
    //   to: {
    //     width: currentWidth,
    //     height: newHeight
    //   },
    //   immediate: true
    // });
  
    // // Update all sections with new dimensions
    // const newSections = sections.map(section => ({
    //   ...section,
    //   section: {
    //     ...section.section,
    //     width: currentWidth,
    //     height: newHeight
    //   }
    // }));
  
    // // Update current section specifically
    // const updatedSection = newSections[curSection];
    // if (updatedSection) {
    //   api.set({
    //     x: updatedSection.section.x,
    //     y: updatedSection.section.y,
    //     width: currentWidth,
    //     height: newHeight
    //   });
    // }
  
    // setSections(newSections);
  };

  const handleDivide = () => {

    let newSections:PlayerSection[] = [];

    for(let i = 0; i < sections.length; i++){
      if(sections[i].start < played && sections[i].end > played){
        
        setCurSection(i);

        const leftSection = {
          start: sections[i].start,
          end: played,
          section: {
            x: x.get(),
            y: y.get(),
            width: width.get(),
            height: height.get(),
          }
        }

        const rightSection = {
          start: played,
          end: sections[i].end,
          section: {
            x: x.get(),
            y: y.get(),
            width: width.get(),
            height: height.get(),
          }
        }

        newSections.push(leftSection);
        newSections.push(rightSection);

      } else {
        newSections.push(sections[i]);
      }
    }

    setSections(newSections);
  }

  const handleSectionClicked = (index:number) => {

    const val = sections[index].start;
    setCurSection(index);
    
    setPlayed(val);
    
    playerRef.current!.seekTo(val);
    

    api.set({
      x: sections[index].section.x,
      y: sections[index].section.y,
      width: sections[index].section.width,
      height: sections[index].section.height,
    });

  }

  if(fetchErr)
    return (
      <Container
      header={
        <Header variant="h2">
          Video #{props.tab+1}
        </Header>
      }>
      <Flashbar
        items={[
          {
            type: "error",
            content: "Failed to make highlight. Try another highlight.",
          }
        ]}
      />
      </Container>
    )

    return (
      <Container
        header={
          <Header variant="h2">
            Video #{props.tab+1}
          </Header>
        }>
        <h3>Edit Title</h3>
        <Input value={title} onChange={({ detail }) => setTitle(detail.value)}/>
  
        <h3>Edit Video Frame</h3>
        <SpaceBetween size="m">
          <SegmentedControl
            selectedId={aspectRatio}
            onChange={handleAspectRatioChange}
            label="Aspect Ratio"
            options={[
              { text: "Square (1:1)", id: "1:1" },
              { text: "Vertical (9:12)", id: "9:12" },
            ]}
          />
          
          { videoUrl !== "" &&
          <>
            <div className='container' ref={containerRef}>
              <animated.div 
                className='cropped-area' 
                style={{ x, y, width, height}} 
                {...bind()}
              >
                <div className='resizer' ref={dragEl}></div>
              </animated.div>
              <ReactPlayer
                url={videoUrl} 
                ref={playerRef}
                className='player'
                playing={playing} 
                controls={false} 
                width='100%'
                height='100%'
                onProgress={({ played }) => setPlayed(played)}
              />
            </div>
            <br />
            <input
              type='range'
              min='0'
              max='0.999999'
              step='any'
              value={played}
              style={{width: "100%"}}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                setPlayed(val);
                if(playerRef.current){
                  playerRef.current.seekTo(val);
                }
              }}
            />
            <div style={{height: "10px", width:"100%", position:"relative", margin: "20px 0"}} ref={progressRef}>
              {
                progressRef.current ? sections.map((section, index) => (
                  <div 
                    key={index} 
                    onClick={()=>{handleSectionClicked(index)}}
                    style={{
                      position: "absolute",
                      backgroundColor: index===curSection ? "red" : "rgba(1, 0, 0, 0.5)",
                      border: "solid black",
                      height: "20px",
                      width: `${(section.end-section.start)*dimensions.width}px`,
                      left: section.start === 0 ? 0 : `${section.start*dimensions.width}px`
                    }} />
                )) : <div style={{backgroundColor:"red", border:"solid black", height: "10px", width:"100%"}}></div>
              }
            </div>
            <br />
            <SpaceBetween size='xs' direction='vertical' alignItems='end'>
              <SpaceBetween size='xs' direction='horizontal'>
                <Button onClick={()=> setPlaying(!playing)}>{playing ? "Pause":"Play"}</Button>
                <Button onClick={handleDivide}>Cut</Button>
                <Button onClick={handleReset}>Reset</Button>
              </SpaceBetween>
            </SpaceBetween>
          </>
          }
        </SpaceBetween>
  
        <h3>Edit Subtitle</h3>
        <Table
          columnDefinitions={[
            {
              id: "timestring",
              header: "Timestamp",
              cell: item => item.timestring,
              isRowHeader: true
            },
            {
              id: "index",
              header: "index",
              cell: item => item.index,
            },
            {
              id: "text",
              header: "Subtitle",
              cell: item => item.text,
              editConfig: {
                ariaLabel: "Name",
                editIconAriaLabel: "editable",
                errorIconAriaLabel: "Name Error",
                editingCell: (
                  item,
                  { currentValue, setValue }
                ) => {
                  return (
                    <Input
                      key={item.index}
                      autoFocus={true}
                      value={currentValue ?? item.text}
                      onChange={event =>
                        setValue(event.detail.value)
                      }
                    />
                  );
                },
              }
            },
          ]}
          submitEdit={(item, _column, newValue) => {
            const newSubtitles = [...subtitles];
            newSubtitles[item.index-1].text = newValue as string;
            setSubtitles(newSubtitles);
          }}
          columnDisplay={[
            { id: "timestring", visible: true },
            { id: "index", visible: false },
            { id: "text", visible: true },
          ]}
          enableKeyboardNavigation
          items={subtitles}
          loadingText="Loading resources"
          trackBy="index"
        />
        <br />
        <Alert statusIconAriaLabel="Info">
          A short form video will be generated based on the values input above and the frames for each section.
        </Alert>
      </Container>
    );
});

export default ShortifyComponent;